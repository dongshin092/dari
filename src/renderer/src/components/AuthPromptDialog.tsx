import { useEffect, useState } from 'react'
import type { AuthPrompt } from '@shared/types'

/** main 프로세스가 접속 중에 비밀번호·OTP를 물을 때 뜨는 창 */
export function AuthPromptDialog() {
  const [queue, setQueue] = useState<AuthPrompt[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [save, setSave] = useState(false)
  const req = queue[0]

  useEffect(() => window.api.auth.onPrompt((r) => setQueue((q) => [...q, r])), [])
  useEffect(() => {
    setAnswers(req ? req.prompts.map(() => '') : [])
    setSave(false)
  }, [req])

  if (!req) return null

  const done = (ok: boolean) => {
    window.api.auth.reply(req.id, ok ? { answers, save } : null)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="modal-bg">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          done(true)
        }}
      >
        <h3>{req.title}</h3>
        {req.instructions && <p className="hint">{req.instructions}</p>}
        {req.prompts.map((p, i) => (
          <label key={i}>
            {p.prompt}
            <input
              autoFocus={i === 0}
              type={p.echo ? 'text' : 'password'}
              value={answers[i] ?? ''}
              onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </label>
        ))}
        {req.allowSave && (
          <label className="check">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            이 PC에 저장 (OS 암호화 저장소)
          </label>
        )}
        <div className="actions">
          <div className="spacer" />
          <button type="button" className="ghost" onClick={() => done(false)}>
            취소
          </button>
          <button type="submit">확인</button>
        </div>
      </form>
    </div>
  )
}
