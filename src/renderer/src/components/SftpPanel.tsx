import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import type { SftpEntry } from '@shared/types'
import { ask, ContextMenu, type MenuItem } from './ui'
import { installCwdHook } from '../cwdHook'

interface Props {
  sessionId: string
  /** 터미널이 알려준 현재 디렉터리 (OSC 7) */
  cwd?: string
  notify: (msg: string) => void
  /** . 으로 시작하는 숨김 파일 표시 */
  showHidden: boolean
  /** 터미널 따라가기 (탭마다 기억, 탭을 옮겨 다녀도 유지) */
  follow: boolean
  onFollowChange: (follow: boolean) => void
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

function fmtMode(mode: number, isDir: boolean) {
  const rwx = (v: number) => `${v & 4 ? 'r' : '-'}${v & 2 ? 'w' : '-'}${v & 1 ? 'x' : '-'}`
  return `${isDir ? 'd' : '-'}${rwx(mode >> 6)}${rwx(mode >> 3)}${rwx(mode)}`
}

const shellQuote = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`

export function SftpPanel({ sessionId, cwd: termCwd, notify, showHidden, follow, onFollowChange }: Props) {
  const [cwd, setCwd] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ file: string; pct: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const load = useCallback(
    async (dir: string) => {
      try {
        const real = await window.api.sftp.realpath(sessionId, dir)
        setEntries(await window.api.sftp.list(sessionId, real))
        setCwd(real)
        setPathInput(real)
        setSelected(null)
      } catch (e) {
        notify(`SFTP: ${(e as Error).message}`)
      }
    },
    [sessionId, notify]
  )

  useEffect(() => {
    void load(termCwd ?? '.')
    // 처음 한 번만: 이후 경로 이동은 아래 follow 효과가 담당
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  // 터미널 경로 따라가기
  useEffect(() => {
    if (follow && termCwd && termCwd !== cwd) void load(termCwd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, termCwd])

  // 셸이 아직 경로를 알려주지 않으면 훅을 넣는다.
  // 재접속 직후에도 따라가기가 켜져 있으면 다시 넣는다 (프롬프트가 뜰 시간을 조금 준다)
  useEffect(() => {
    if (!follow || termCwd) return
    const timer = setTimeout(() => installCwdHook(sessionId), 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, sessionId])

  const toggleFollow = () => onFollowChange(!follow)

  useEffect(
    () =>
      window.api.sftp.onProgress((id, p) => {
        if (id !== sessionId) return
        const pct = p.total ? Math.round((p.transferred / p.total) * 100) : 0
        setProgress(pct >= 100 ? null : { file: p.file, pct })
      }),
    [sessionId]
  )

  /** 작업 실행 후 목록 새로고침, 실패하면 알림 */
  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      void load(cwd)
    } catch (e) {
      notify(`${label} 실패: ${(e as Error).message}`)
    }
  }

  const upload = (paths: string[]) =>
    act('업로드', async () => {
      const n = await window.api.sftp.upload(sessionId, cwd, paths)
      if (n) notify(`${n}개 파일 업로드 완료`)
    })

  const join = (name: string) => (cwd === '/' ? `/${name}` : `${cwd}/${name}`)

  const newFolder = async () => {
    const name = await ask({ title: '새 폴더', label: `${cwd} 아래에 만들 폴더 이름` })
    if (name) void act('폴더 생성', () => window.api.sftp.mkdir(sessionId, join(name)))
  }

  const renameEntry = async (f: SftpEntry) => {
    const name = await ask({ title: '이름 변경', label: f.name, value: f.name })
    if (name && name !== f.name) void act('이름 변경', () => window.api.sftp.rename(sessionId, f.path, join(name)))
  }

  const chmodEntry = async (f: SftpEntry) => {
    const v = await ask({
      title: '권한 변경',
      label: `${f.name}  (현재 ${fmtMode(f.mode, f.isDir)})`,
      value: f.mode.toString(8).padStart(3, '0'),
      placeholder: '예: 644, 755'
    })
    if (v === null) return
    if (!/^[0-7]{3,4}$/.test(v)) return notify('권한은 644, 0755 같은 8진수로 입력하세요')
    void act('권한 변경', () => window.api.sftp.chmod(sessionId, f.path, parseInt(v, 8)))
  }

  const removeEntry = (f: SftpEntry) => {
    const msg = f.isDir ? `'${f.name}' 폴더와 안의 모든 내용을 삭제할까요?` : `'${f.name}' 파일을 삭제할까요?`
    if (confirm(msg)) void act('삭제', () => window.api.sftp.remove(sessionId, f.path, f.isDir))
  }

  const editEntry = (f: SftpEntry) =>
    window.api.sftp
      .editLocal(sessionId, f.path)
      .then(() => notify(`편집 중: ${f.name} — 저장하면 자동 업로드됩니다`))
      .catch((e: Error) => notify(e.message))

  const download = (f: SftpEntry) =>
    window.api.sftp
      .download(sessionId, f.path)
      .then((p) => p && notify(`저장됨: ${p}`))
      .catch((e: Error) => notify(`다운로드 실패: ${e.message}`))

  const cdTerminal = (dir: string) => window.api.term.write(sessionId, ` cd ${shellQuote(dir)}\r`)

  const openMenu = (e: MouseEvent, f: SftpEntry | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (f) setSelected(f.path)
    const items: MenuItem[] = f
      ? [
          { label: '열기', onClick: () => void load(f.path), hidden: !f.isDir },
          { label: '터미널에서 이 폴더로 cd', onClick: () => cdTerminal(f.path), hidden: !f.isDir },
          { label: '로컬 에디터로 편집', onClick: () => void editEntry(f), hidden: f.isDir },
          { label: '다운로드', onClick: () => void download(f), hidden: f.isDir },
          { label: '이름 변경', onClick: () => void renameEntry(f) },
          { label: '권한 변경', onClick: () => void chmodEntry(f) },
          { label: '경로 복사', onClick: () => void navigator.clipboard.writeText(f.path) },
          { label: '삭제', danger: true, onClick: () => removeEntry(f) }
        ]
      : [
          { label: '새 폴더', onClick: () => void newFolder() },
          { label: '업로드', onClick: () => void upload([]) },
          { label: '새로고침', onClick: () => void load(cwd) },
          { label: '터미널에서 이 폴더로 cd', onClick: () => cdTerminal(cwd) }
        ]
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const selectedEntry = entries.find((x) => x.path === selected)
  const parent = cwd === '/' ? null : cwd.replace(/\/[^/]+\/?$/, '') || '/'

  return (
    <section
      className={`sftp ${dragOver ? 'drag' : ''}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT' || !selectedEntry) return
        if (e.key === 'F2') void renameEntry(selectedEntry)
        if (e.key === 'Delete') removeEntry(selectedEntry)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const paths = [...e.dataTransfer.files].map((f) => window.api.sftp.pathForFile(f))
        if (paths.length) void upload(paths)
      }}
    >
      <div className="toolbar">
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void load(pathInput)}
        />
        <button title="새로고침" onClick={() => void load(cwd)}>
          ↻
        </button>
      </div>
      <div className="toolbar">
        <button className="ghost" onClick={() => void newFolder()}>
          새 폴더
        </button>
        <button className="ghost" onClick={() => void upload([])}>
          업로드
        </button>
        <label className="inline" title="터미널에서 cd 하면 이 패널도 같은 폴더로 이동합니다">
          <input type="checkbox" checked={follow} onChange={toggleFollow} />
          터미널 따라가기
        </label>
      </div>
      {progress && (
        <div className="progress">
          <div style={{ width: `${progress.pct}%` }} />
          <span>
            {progress.file.split('/').pop()} {progress.pct}%
          </span>
        </div>
      )}
      <ul className="files" onContextMenu={(e) => openMenu(e, null)}>
        {parent && (
          <li onDoubleClick={() => void load(parent)}>
            <span>📁 ..</span>
          </li>
        )}
        {entries.filter((f) => showHidden || !f.name.startsWith('.')).map((f) => (
          <li
            key={f.path}
            className={selected === f.path ? 'sel' : ''}
            title={`${fmtMode(f.mode, f.isDir)}  ${new Date(f.mtime).toLocaleString()}`}
            onClick={() => setSelected(f.path)}
            onDoubleClick={() => (f.isDir ? void load(f.path) : void editEntry(f))}
            onContextMenu={(e) => openMenu(e, f)}
          >
            <span>
              {f.isDir ? '📁' : '📄'} {f.name}
            </span>
            {!f.isDir && <small>{fmtSize(f.size)}</small>}
          </li>
        ))}
      </ul>
      <p className="hint">더블클릭: 폴더 열기 / 파일 편집 · 우클릭: 메뉴 · F2 이름 변경 · Del 삭제 · 끌어다 놓기: 업로드</p>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </section>
  )
}
