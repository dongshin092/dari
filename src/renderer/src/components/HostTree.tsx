import { useEffect, useState } from 'react'
import type { Folder, Host, TerminalOpenResult } from '@shared/types'
import { HostDialog } from './HostDialog'

interface Props {
  onOpen: (connect: () => Promise<TerminalOpenResult>) => void
}

export function HostTree({ onOpen }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [editing, setEditing] = useState<Host | 'new' | null>(null)
  const [filter, setFilter] = useState('')

  const reload = async () => {
    setFolders(await window.api.db.listFolders())
    setHosts(await window.api.db.listHosts())
  }
  useEffect(() => {
    void reload()
  }, [])

  // Electron은 window.prompt를 지원하지 않아 인라인 입력을 쓴다
  const [folderName, setFolderName] = useState<string | null>(null)
  const addFolder = async () => {
    if (folderName?.trim()) {
      await window.api.db.saveFolder(folderName.trim(), null)
      void reload()
    }
    setFolderName(null)
  }

  const q = filter.toLowerCase()
  const visible = hosts.filter((h) => !q || h.label.toLowerCase().includes(q) || h.hostname.toLowerCase().includes(q))

  const renderHost = (h: Host) => (
    <li
      key={h.id}
      className="host"
      title={`${h.username}@${h.hostname}:${h.port}`}
      onDoubleClick={() => onOpen(() => window.api.term.openHost(h.id))}
      onContextMenu={(e) => {
        e.preventDefault()
        setEditing(h)
      }}
    >
      <span className="badge">{h.authType === 'key' ? 'KEY' : 'PW'}</span>
      {h.label}
    </li>
  )

  return (
    <div className="panel">
      <div className="toolbar">
        <input placeholder="검색" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button onClick={() => setEditing('new')}>+ 서버</button>
        <button onClick={() => setFolderName('')}>+ 폴더</button>
      </div>
      {folderName !== null && (
        <div className="toolbar">
          <input
            autoFocus
            placeholder="폴더 이름 입력 후 Enter"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addFolder()
              if (e.key === 'Escape') setFolderName(null)
            }}
          />
        </div>
      )}
      <ul className="tree">
        {folders.map((f) => (
          <li key={f.id}>
            <div className="folder">📁 {f.name}</div>
            <ul>{visible.filter((h) => h.folderId === f.id).map(renderHost)}</ul>
          </li>
        ))}
        {visible.filter((h) => !h.folderId).map(renderHost)}
      </ul>
      <p className="hint">더블클릭: 접속 · 우클릭: 편집</p>

      {editing && (
        <HostDialog
          host={editing === 'new' ? null : editing}
          folders={folders}
          onClose={(changed) => {
            setEditing(null)
            if (changed) void reload()
          }}
        />
      )}
    </div>
  )
}
