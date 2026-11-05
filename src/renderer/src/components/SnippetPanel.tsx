import { useEffect, useState } from 'react'
import type { Snippet } from '@shared/types'
import { ask, ContextMenu, type MenuItem } from './ui'

interface Props {
  onRun: (text: string) => void
  broadcastOn: boolean
}

export function SnippetPanel({ onRun, broadcastOn }: Props) {
  const [items, setItems] = useState<Snippet[]>([])
  const [enter, setEnter] = useState(true)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const reload = async () => setItems(await window.api.snippets.list())
  useEffect(() => {
    void reload()
  }, [])

  const edit = async (s?: Snippet) => {
    const name = await ask({ title: s ? '스니펫 수정' : '새 스니펫', label: '이름', value: s?.name ?? '' })
    if (!name) return
    const command = await ask({
      title: name,
      label: '명령어 (여러 줄 가능)',
      value: s?.command ?? '',
      placeholder: 'tail -f /var/log/nginx/error.log',
      multiline: true
    })
    if (command === null) return
    await window.api.snippets.save({ id: s?.id, name, command })
    void reload()
  }

  const run = (s: Snippet) => {
    // 여러 줄 명령은 줄마다 Enter, 마지막 줄은 옵션에 따름
    const text = s.command.replace(/\r?\n/g, '\r')
    onRun(enter ? `${text}\r` : text)
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <button onClick={() => void edit()}>+ 스니펫</button>
        <label className="inline">
          <input type="checkbox" checked={enter} onChange={(e) => setEnter(e.target.checked)} />
          Enter까지 입력
        </label>
      </div>
      {broadcastOn && <div className="notice warn">동시 입력 켜짐: 체크한 모든 탭에 실행됩니다</div>}
      <ul className="tree">
        {items.map((s) => (
          <li
            key={s.id}
            className="host snippet"
            title={s.command}
            onDoubleClick={() => run(s)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: '실행', onClick: () => run(s) },
                  { label: '수정', onClick: () => void edit(s) },
                  {
                    label: '삭제',
                    danger: true,
                    onClick: () => {
                      if (confirm(`'${s.name}' 스니펫을 삭제할까요?`))
                        void window.api.snippets.remove(s.id).then(reload)
                    }
                  }
                ]
              })
            }}
          >
            <span className="badge">$</span>
            {s.name}
          </li>
        ))}
        {items.length === 0 && <p className="hint">자주 쓰는 명령어를 저장해 두고 더블클릭으로 실행하세요.</p>}
      </ul>
      <p className="hint">더블클릭: 실행 · 우클릭: 수정/삭제</p>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
