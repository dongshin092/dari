import { useEffect, useMemo, useRef, useState } from 'react'
import type { Folder, Host } from '@shared/types'

interface Props {
  onPick: (host: Host) => void
  onClose: () => void
}

/** 새 탭: 서버를 검색해서 고르면 새 탭으로 접속 (Ctrl+Shift+T) */
export function QuickConnect({ onPick, onClose }: Props) {
  const [hosts, setHosts] = useState<Host[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    void window.api.db.listHosts().then(setHosts)
    void window.api.db.listFolders().then(setFolders)
  }, [])

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return hosts.filter(
      (h) =>
        !k ||
        h.label.toLowerCase().includes(k) ||
        h.hostname.toLowerCase().includes(k) ||
        h.username.toLowerCase().includes(k) ||
        (folderName(h.folderId) ?? '').toLowerCase().includes(k)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts, folders, q])

  useEffect(() => setIdx(0), [q])
  useEffect(() => {
    list.current?.children[idx]?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const pick = (h?: Host) => {
    if (!h) return
    onPick(h)
    onClose()
  }

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal quick" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="접속할 서버 검색 (이름 · 주소 · 사용자 · 폴더)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(i + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') pick(shown[idx])
            else if (e.key === 'Escape') onClose()
          }}
        />
        <ul ref={list} className="quick-list">
          {shown.map((h, i) => (
            <li
              key={h.id}
              className={i === idx ? 'sel' : ''}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(h)}
            >
              <span className="badge">{h.authType === 'key' ? 'KEY' : 'PW'}</span>
              <b>{h.label}</b>
              <small>
                {h.username}@{h.hostname}
                {h.port !== 22 ? `:${h.port}` : ''}
              </small>
              {folderName(h.folderId) && <small className="folder-tag">{folderName(h.folderId)}</small>}
            </li>
          ))}
          {shown.length === 0 && <li className="empty-row">{hosts.length ? '검색 결과가 없습니다' : '등록된 서버가 없습니다'}</li>}
        </ul>
        <p className="hint">↑↓ 선택 · Enter 접속 · Esc 닫기</p>
      </div>
    </div>
  )
}
