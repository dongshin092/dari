import { useEffect, useState } from 'react'
import type { AuthType, Encoding, Folder, Host, HostInput } from '@shared/types'

interface Props {
  host: Host | null
  folders: Folder[]
  onClose: (changed: boolean) => void
}

const empty: HostInput = {
  folderId: null,
  label: '',
  hostname: '',
  port: 22,
  username: '',
  authType: 'key',
  keyPath: null,
  encoding: 'utf-8'
}

export function HostDialog({ host, folders, onClose }: Props) {
  const [f, setF] = useState<HostInput>(
    host
      ? {
          id: host.id,
          folderId: host.folderId,
          label: host.label,
          hostname: host.hostname,
          port: host.port,
          username: host.username,
          authType: host.authType,
          keyPath: host.keyPath,
          encoding: host.encoding ?? 'utf-8'
        }
      : empty
  )

  // 새 서버는 설정의 접속 기본값으로 채운다
  useEffect(() => {
    if (host) return
    void window.api.settings.get().then((d) =>
      setF((cur) => ({
        ...cur,
        username: cur.username || d.defaultUsername,
        port: d.defaultPort || 22,
        keyPath: cur.keyPath || d.defaultKeyPath || null,
        authType: d.defaultKeyPath ? 'key' : cur.authType,
        encoding: d.defaultEncoding
      }))
    )
  }, [host])
  // 비밀값은 다시 보여주지 않는다. 비워 두면 기존 값을 유지한다.
  const [secret, setSecret] = useState('')
  const set = <K extends keyof HostInput>(k: K, v: HostInput[K]) => setF((s) => ({ ...s, [k]: v }))

  const save = async () => {
    if (!f.label || !f.hostname) return alert('이름과 호스트는 필수입니다')
    await window.api.db.saveHost({ ...f, secret: secret || undefined })
    onClose(true)
  }

  const remove = async () => {
    if (host && confirm(`'${host.label}' 을(를) 삭제할까요?`)) {
      await window.api.db.deleteHost(host.id)
      onClose(true)
    }
  }

  return (
    <div className="modal-bg" onClick={() => onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{host ? '서버 편집' : '새 서버'}</h3>
        <label>
          이름 <input value={f.label} onChange={(e) => set('label', e.target.value)} />
        </label>
        <label>
          폴더
          <select value={f.folderId ?? ''} onChange={(e) => set('folderId', e.target.value || null)}>
            <option value="">(없음)</option>
            {folders.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          접속 방식
          <select value={f.authType} onChange={(e) => set('authType', e.target.value as AuthType)}>
            <option value="key">SSH · 키 파일</option>
            <option value="password">SSH · 비밀번호</option>
          </select>
        </label>
        <label>
          문자 인코딩
          <select value={f.encoding} onChange={(e) => set('encoding', e.target.value as Encoding)}>
            <option value="utf-8">UTF-8 (대부분의 서버)</option>
            <option value="cp949">EUC-KR / CP949 (오래된 국내 서버)</option>
          </select>
        </label>

        <div className="row">
          <label className="grow">
            호스트 <input value={f.hostname} onChange={(e) => set('hostname', e.target.value)} />
          </label>
          <label className="port">
            포트 <input type="number" value={f.port} onChange={(e) => set('port', Number(e.target.value))} />
          </label>
        </div>
        <label>
          사용자 <input value={f.username} onChange={(e) => set('username', e.target.value)} />
        </label>
        {f.authType === 'key' && (
          <label>
            키 파일 경로 <input value={f.keyPath ?? ''} placeholder="C:\Users\me\.ssh\id_ed25519 또는 my.pem" onChange={(e) => set('keyPath', e.target.value)} />
          </label>
        )}
        <label>
          {f.authType === 'key' ? '키 패스프레이즈 (선택)' : '비밀번호'}
          <input
            type="password"
            value={secret}
            placeholder={host ? '변경할 때만 입력' : f.authType === 'password' ? '비워 두면 접속할 때마다 묻습니다' : ''}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>

        <div className="actions">
          {host && (
            <button className="danger" onClick={remove}>
              삭제
            </button>
          )}
          <div className="spacer" />
          <button className="ghost" onClick={() => onClose(false)}>
            취소
          </button>
          <button onClick={save}>저장</button>
        </div>
      </div>
    </div>
  )
}
