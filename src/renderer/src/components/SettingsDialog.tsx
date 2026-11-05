import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { AppSettings, AppTheme, CursorStyle, Encoding } from '@shared/types'
import { FONT_CANDIDATES, TERMINAL_THEMES, findTheme, fontStack } from '../themes'

interface Props {
  settings: AppSettings
  onSave: (patch: Partial<AppSettings>) => void
  onReplace: (s: AppSettings) => void
  onClose: () => void
}

/** 창을 옮긴 위치를 기억해 두었다가 다시 열 때 그 자리에 연다 (앱을 끄면 초기화) */
let lastPos: { x: number; y: number } | null = null

/** 글꼴이 이 PC에 설치되어 있는지: 기본 글꼴과 글자 폭이 다르면 설치된 것으로 본다 */
function isInstalled(font: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')!
  const sample = 'mmmmmmmmmmlli10OO한글'
  return ['monospace', 'serif'].some((base) => {
    ctx.font = `20px ${base}`
    const w0 = ctx.measureText(sample).width
    ctx.font = `20px "${font}", ${base}`
    return ctx.measureText(sample).width !== w0
  })
}

function Row(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="set-row">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small>{props.hint}</small>}
    </div>
  )
}

/** 읽기 전용 경로 + 찾기/지우기 버튼 */
function PathPicker(props: { value: string; placeholder: string; kind: 'file' | 'folder'; onChange: (v: string) => void }) {
  return (
    <div className="row">
      <input value={props.value} placeholder={props.placeholder} readOnly title={props.value} />
      <button
        onClick={async () => {
          const p = await window.api.settings.pickPath(props.kind)
          if (p) props.onChange(p)
        }}
      >
        찾기
      </button>
      {props.value && (
        <button className="ghost" onClick={() => props.onChange('')}>
          지우기
        </button>
      )}
    </div>
  )
}

const TERMINAL_KEYS: (keyof AppSettings)[] = [
  'terminalTheme',
  'fontFamily',
  'fontSize',
  'lineHeight',
  'cursorStyle',
  'cursorBlink',
  'scrollback'
]

export function SettingsDialog({ settings: s, onSave, onReplace, onClose }: Props) {
  const fonts = useMemo(() => FONT_CANDIDATES.map((f) => ({ name: f, installed: isInstalled(f) })), [])
  const theme = findTheme(s.terminalTheme)
  const c = theme.colors
  const fontMissing = !isInstalled(s.fontFamily)

  /* ---------- 제목줄을 잡고 끌어서 이동 ---------- */
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(lastPos)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const clamp = (x: number, y: number) => {
    const w = box.current?.offsetWidth ?? 560
    // 창이 화면 밖으로 완전히 나가지 않게: 제목줄은 항상 보이도록
    return {
      x: Math.min(Math.max(x, 80 - w), window.innerWidth - 80),
      y: Math.min(Math.max(y, 0), window.innerHeight - 48)
    }
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const r = box.current!.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const p = clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy)
    lastPos = p
    setPos(p)
  }
  const onUp = () => {
    drag.current = null
  }
  // 창 크기가 바뀌어 화면 밖으로 밀려나면 다시 안으로
  useEffect(() => {
    const fix = () => setPos((p) => (p ? (lastPos = clamp(p.x, p.y)) : p))
    window.addEventListener('resize', fix)
    return () => window.removeEventListener('resize', fix)
  }, [])

  // 터미널에 포커스가 있으면 Esc를 터미널이 먼저 가져가므로 capture 단계에서 받는다.
  // 열리면 포커스도 설정창으로 옮겨 키 입력이 터미널로 새지 않게 한다.
  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="modal-bg settings-bg" onMouseDown={onClose}>
    <div
      ref={box}
      className={`modal settings-modal ${pos ? 'moved' : ''}`}
      tabIndex={-1}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="settings-head"
        title="끌어서 이동 · 더블클릭하면 가운데로"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => {
          lastPos = null
          setPos(null)
        }}
      >
        <h3>설정</h3>
        <button className="x" title="닫기 (Esc)" onClick={onClose}>
          ×
        </button>
      </div>
    <div className="settings">
      <h4>화면</h4>
      <Row label="앱 테마">
        <div className="seg">
          {(
            [
              ['dark', '다크'],
              ['light', '라이트'],
              ['system', '시스템']
            ] as [AppTheme, string][]
          ).map(([v, label]) => (
            <button key={v} className={s.appTheme === v ? 'on' : 'ghost'} onClick={() => onSave({ appTheme: v })}>
              {label}
            </button>
          ))}
        </div>
      </Row>
      <Row label={`메뉴 글자 크기 · ${s.uiFontSize}px`}>
        <input type="range" min={11} max={17} value={s.uiFontSize} onChange={(e) => onSave({ uiFontSize: Number(e.target.value) })} />
      </Row>

      <h4>터미널</h4>
      <Row label={`색 테마 · ${s.terminalTheme}`}>
        {(['어두운 테마', '밝은 테마'] as const).map((group) => (
          <div key={group}>
            <small className="group-label">{group}</small>
            <div className="theme-grid">
              {TERMINAL_THEMES.filter((t) => t.dark === (group === '어두운 테마')).map((t) => (
                <button
                  key={t.name}
                  className={`theme-tile ${s.terminalTheme === t.name ? 'on' : ''}`}
                  style={{ background: t.colors.background, color: t.colors.foreground }}
                  title={t.name}
                  onClick={() => onSave({ terminalTheme: t.name })}
                >
                  <span className="theme-name">{t.name}</span>
                  <span className="theme-dots">
                    {[t.colors.red, t.colors.green, t.colors.yellow, t.colors.blue, t.colors.magenta, t.colors.cyan].map(
                      (c, k) => (
                        <i key={k} style={{ background: c }} />
                      )
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Row>

      {/* 미리보기 */}
      <pre
        className="term-preview"
        style={{
          background: c.background,
          color: c.foreground,
          fontFamily: fontStack(s.fontFamily),
          fontSize: s.fontSize,
          lineHeight: s.lineHeight
        }}
      >
        <span style={{ color: c.green }}>root@web-01</span>:<span style={{ color: c.blue }}>~</span>$ ls -l{'\n'}
        <span style={{ color: c.blue }}>conf</span>  <span style={{ color: c.green }}>deploy.sh</span>  nginx.log{'\n'}
        <span style={{ color: c.red }}>error</span> <span style={{ color: c.yellow }}>warn</span>{' '}
        <span style={{ color: c.cyan }}>info</span> 한글 OK 0O 1lI{'\n'}
        $ <span style={{ background: c.cursor, color: c.background }}> </span>
      </pre>

      <Row
        label="글꼴"
        hint={fontMissing ? `'${s.fontFamily}' 글꼴이 이 PC에 없어 대체 글꼴로 보입니다` : undefined}
      >
        <input
          list="font-candidates"
          value={s.fontFamily}
          onChange={(e) => onSave({ fontFamily: e.target.value })}
          placeholder="글꼴 이름"
        />
        <datalist id="font-candidates">
          {fonts.map((f) => (
            <option key={f.name} value={f.name}>
              {f.installed ? '설치됨' : '없음'}
            </option>
          ))}
        </datalist>
      </Row>
      <div className="font-chips">
        {fonts
          .filter((f) => f.installed)
          .map((f) => (
            <button
              key={f.name}
              className={s.fontFamily === f.name ? 'on' : 'ghost'}
              style={{ fontFamily: fontStack(f.name) }}
              onClick={() => onSave({ fontFamily: f.name })}
            >
              {f.name}
            </button>
          ))}
      </div>

      <Row label={`글자 크기 · ${s.fontSize}px`} hint="터미널에서 Ctrl + = / - / 0 으로도 바꿀 수 있어요">
        <input type="range" min={9} max={28} value={s.fontSize} onChange={(e) => onSave({ fontSize: Number(e.target.value) })} />
      </Row>
      <Row label={`줄 간격 · ${s.lineHeight.toFixed(1)}`}>
        <input
          type="range"
          min={1}
          max={1.8}
          step={0.1}
          value={s.lineHeight}
          onChange={(e) => onSave({ lineHeight: Number(e.target.value) })}
        />
      </Row>
      <Row label="커서">
        <div className="seg">
          {(
            [
              ['block', '█ 블록'],
              ['bar', '| 막대'],
              ['underline', '_ 밑줄']
            ] as [CursorStyle, string][]
          ).map(([v, label]) => (
            <button key={v} className={s.cursorStyle === v ? 'on' : 'ghost'} onClick={() => onSave({ cursorStyle: v })}>
              {label}
            </button>
          ))}
        </div>
      </Row>
      <label className="inline">
        <input type="checkbox" checked={s.cursorBlink} onChange={(e) => onSave({ cursorBlink: e.target.checked })} />
        커서 깜빡임
      </label>
      <Row label="스크롤 기록 (줄)">
        <select value={s.scrollback} onChange={(e) => onSave({ scrollback: Number(e.target.value) })}>
          {[1000, 5000, 10000, 50000, 100000].map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()}
            </option>
          ))}
        </select>
      </Row>
      <p className="set-note">
        복사·붙여넣기: 글자를 드래그로 선택한 뒤 <kbd>Ctrl</kbd>+<kbd>C</kbd>, 붙여넣기는 <kbd>Ctrl</kbd>+<kbd>V</kbd>.
        선택한 글자가 없을 때 <kbd>Ctrl</kbd>+<kbd>C</kbd>는 평소처럼 실행 중인 명령을 중단합니다.
      </p>
      <button
        className="ghost"
        onClick={async () => {
          if (confirm('터미널 설정을 기본값으로 되돌릴까요?')) onReplace(await window.api.settings.reset(TERMINAL_KEYS))
        }}
      >
        터미널 설정 기본값으로
      </button>

      <h4>접속 기본값</h4>
      <p className="set-note">새 서버를 등록할 때 미리 채워지는 값입니다.</p>
      <div className="two-col">
        <Row label="사용자">
          <input
            defaultValue={s.defaultUsername}
            placeholder="예: ubuntu, ec2-user"
            onBlur={(e) => e.target.value.trim() !== s.defaultUsername && onSave({ defaultUsername: e.target.value.trim() })}
          />
        </Row>
        <Row label="포트">
          <input
            type="number"
            min={1}
            max={65535}
            value={s.defaultPort}
            onChange={(e) => onSave({ defaultPort: Number(e.target.value) || 22 })}
          />
        </Row>
      </div>
      <Row label="키 파일" hint="지정하면 새 서버의 접속 방식이 '키 파일'로 시작합니다">
        <PathPicker value={s.defaultKeyPath} placeholder="없음" kind="file" onChange={(v) => onSave({ defaultKeyPath: v })} />
      </Row>
      <Row label="문자 인코딩" hint="서버마다 따로 바꿀 수 있습니다 (서버 편집 화면)">
        <select value={s.defaultEncoding} onChange={(e) => onSave({ defaultEncoding: e.target.value as Encoding })}>
          <option value="utf-8">UTF-8 (대부분의 서버)</option>
          <option value="cp949">EUC-KR / CP949 (오래된 국내 서버)</option>
        </select>
      </Row>

      <h4>SFTP</h4>
      <label className="inline">
        <input type="checkbox" checked={s.showHidden} onChange={(e) => onSave({ showHidden: e.target.checked })} />
        숨김 파일 표시 (.bashrc 처럼 . 으로 시작하는 파일)
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={s.confirmOverwrite}
          onChange={(e) => onSave({ confirmOverwrite: e.target.checked })}
        />
        업로드할 때 같은 이름의 파일이 있으면 묻기
      </label>
      <Row label="다운로드 폴더" hint="지정하면 묻지 않고 바로 저장합니다. 같은 이름이 있으면 '이름 (1)'로 저장해요">
        <PathPicker value={s.downloadDir} placeholder="다운로드할 때마다 묻기" kind="folder" onChange={(v) => onSave({ downloadDir: v })} />
      </Row>

      <h4>파일 편집</h4>
      <Row label="원격 파일 편집 에디터" hint="비우면 OS 기본 프로그램. 예: VS Code의 Code.exe / Visual Studio Code.app">
        <div className="row">
          <input value={s.editorPath} placeholder="OS 기본 프로그램" readOnly />
          <button
            onClick={async () => {
              const p = await window.api.settings.pickEditor()
              if (p) onSave({ editorPath: p })
            }}
          >
            찾기
          </button>
          {s.editorPath && (
            <button className="ghost" onClick={() => onSave({ editorPath: '' })}>
              지우기
            </button>
          )}
        </div>
      </Row>

      <h4>연결</h4>
      <label className="inline">
        <input type="checkbox" checked={s.autoReconnect} onChange={(e) => onSave({ autoReconnect: e.target.checked })} />
        연결이 끊기면 자동 재접속 (최대 3회)
      </label>
      <div className="two-col">
        <Row label="연결 유지 신호 (초)" hint="0이면 끔. 방화벽이 유휴 연결을 끊을 때 짧게">
          <input
            type="number"
            min={0}
            max={600}
            value={s.keepaliveSec}
            onChange={(e) => onSave({ keepaliveSec: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Row>
        <Row label="접속 대기 시간 (초)">
          <input
            type="number"
            min={5}
            max={120}
            value={s.connectTimeoutSec}
            onChange={(e) => onSave({ connectTimeoutSec: Math.max(5, Number(e.target.value) || 20) })}
          />
        </Row>
      </div>
      <Row label="세션 로그 기본 폴더">
        <input
          defaultValue={s.logDir}
          placeholder="비우면 문서\Dari Logs"
          onBlur={(e) => e.target.value.trim() !== s.logDir && onSave({ logDir: e.target.value.trim() })}
        />
      </Row>
    </div>
    </div>
    </div>
  )
}
