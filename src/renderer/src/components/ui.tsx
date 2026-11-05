import { useEffect, useState, type ReactNode } from 'react'

/* ---------- 입력 창 (Electron은 window.prompt를 지원하지 않음) ---------- */

interface AskOptions {
  title: string
  label?: string
  value?: string
  placeholder?: string
  multiline?: boolean
}
interface AskRequest extends AskOptions {
  resolve: (v: string | null) => void
}

let pushAsk: ((r: AskRequest) => void) | null = null

/** 텍스트 하나를 입력받는다. 취소하면 null */
export function ask(opts: AskOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!pushAsk) return resolve(null)
    pushAsk({ ...opts, resolve })
  })
}

export function AskHost() {
  const [queue, setQueue] = useState<AskRequest[]>([])
  const [value, setValue] = useState('')
  const req = queue[0]

  useEffect(() => {
    pushAsk = (r) => setQueue((q) => [...q, r])
    return () => {
      pushAsk = null
    }
  }, [])
  useEffect(() => setValue(req?.value ?? ''), [req])

  if (!req) return null
  const done = (v: string | null) => {
    req.resolve(v)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="modal-bg" onClick={() => done(null)}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          done(value)
        }}
      >
        <h3>{req.title}</h3>
        <label>
          {req.label}
          {req.multiline ? (
            <textarea
              autoFocus
              rows={6}
              value={value}
              placeholder={req.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) done(value)
              }}
            />
          ) : (
            <input
              autoFocus
              value={value}
              placeholder={req.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => {
                // 파일 이름 변경 시 확장자 앞까지만 선택
                const dot = e.target.value.lastIndexOf('.')
                e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
              }}
            />
          )}
        </label>
        {req.multiline && <p className="hint">Ctrl+Enter로 확인</p>}
        <div className="actions">
          <div className="spacer" />
          <button type="button" className="ghost" onClick={() => done(null)}>
            취소
          </button>
          <button type="submit">확인</button>
        </div>
      </form>
    </div>
  )
}

/* ---------- 우클릭 메뉴 ---------- */

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  hidden?: boolean
}

export function ContextMenu(props: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const { x, y, items, onClose } = props
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  // 화면 밖으로 나가지 않게 위치 보정
  const left = Math.min(x, window.innerWidth - 200)
  const topPos = Math.min(y, window.innerHeight - items.length * 30 - 12)

  return (
    <ul className="ctx" style={{ left, top: topPos }} onContextMenu={(e) => e.preventDefault()}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <li key={i.label} className={i.danger ? 'danger' : ''} onClick={i.onClick}>
            {i.label}
          </li>
        ))}
    </ul>
  )
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="folder">{props.title}</div>
      {props.children}
    </div>
  )
}
