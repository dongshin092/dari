import Database from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppSettings, Folder, Host, HostInput, Snippet } from '@shared/types'

let db: Database.Database

// 버전별 스키마. 새 변경은 배열 끝에만 추가한다.
const MIGRATIONS: string[] = [
  `CREATE TABLE folders (
     id TEXT PRIMARY KEY,
     parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE hosts (
     id TEXT PRIMARY KEY,
     folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
     label TEXT NOT NULL,
     hostname TEXT NOT NULL,
     port INTEGER NOT NULL DEFAULT 22,
     username TEXT NOT NULL DEFAULT '',
     auth_type TEXT NOT NULL,
     key_path TEXT,
     source TEXT NOT NULL DEFAULT 'local',
     aws_profile TEXT,
     aws_region TEXT,
     instance_id TEXT
   );
   CREATE TABLE secrets (
     owner_id TEXT PRIMARY KEY,
     enc BLOB NOT NULL
   );
   CREATE TABLE known_hosts (
     host TEXT NOT NULL,
     port INTEGER NOT NULL,
     key_type TEXT NOT NULL,
     fingerprint TEXT NOT NULL,
     added_at INTEGER NOT NULL,
     PRIMARY KEY (host, port)
   );
   -- aws_instances: 예전 버전의 AWS 연동용 (지금은 사용하지 않음, 기존 DB 호환을 위해 남겨 둠)
   CREATE TABLE aws_instances (
     instance_id TEXT NOT NULL,
     profile TEXT NOT NULL,
     region TEXT NOT NULL,
     data TEXT NOT NULL,
     synced_at INTEGER NOT NULL,
     PRIMARY KEY (profile, instance_id)
   );`,
  `CREATE TABLE snippets (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     command TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `ALTER TABLE hosts ADD COLUMN encoding TEXT NOT NULL DEFAULT 'utf-8';`
]

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'dari.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const version = db.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

/* ---------- folders ---------- */

export function listFolders(): Folder[] {
  return db
    .prepare('SELECT id, parent_id AS parentId, name, sort_order AS sortOrder FROM folders ORDER BY sort_order, name')
    .all() as Folder[]
}

export function saveFolder(name: string, parentId: string | null, id?: string): string {
  const fid = id ?? randomUUID()
  db.prepare(
    `INSERT INTO folders (id, parent_id, name) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id`
  ).run(fid, parentId, name)
  return fid
}

export function deleteFolder(id: string): void {
  db.prepare('DELETE FROM folders WHERE id = ?').run(id)
}

/* ---------- hosts ---------- */

const HOST_COLS = `id, folder_id AS folderId, label, hostname, port, username, auth_type AS authType,
  key_path AS keyPath, source, encoding`

export function listHosts(): Host[] {
  return db.prepare(`SELECT ${HOST_COLS} FROM hosts ORDER BY label`).all() as Host[]
}

export function getHost(id: string): Host | undefined {
  return db.prepare(`SELECT ${HOST_COLS} FROM hosts WHERE id = ?`).get(id) as Host | undefined
}

export async function saveHost(input: HostInput): Promise<string> {
  const id = input.id ?? randomUUID()
  db.prepare(
    `INSERT INTO hosts (id, folder_id, label, hostname, port, username, auth_type, key_path, source, encoding)
     VALUES (@id, @folderId, @label, @hostname, @port, @username, @authType, @keyPath, 'local', @encoding)
     ON CONFLICT(id) DO UPDATE SET folder_id=@folderId, label=@label, hostname=@hostname, port=@port, username=@username,
       auth_type=@authType, key_path=@keyPath, encoding=@encoding`
  ).run({
    id,
    folderId: input.folderId,
    label: input.label,
    hostname: input.hostname,
    port: input.port,
    username: input.username,
    authType: input.authType,
    keyPath: input.keyPath,
    encoding: input.encoding ?? 'utf-8'
  })
  if (input.secret !== undefined) await setSecret(id, input.secret)
  return id
}

export function deleteHost(id: string): void {
  db.prepare('DELETE FROM hosts WHERE id = ?').run(id)
  db.prepare('DELETE FROM secrets WHERE owner_id = ?').run(id)
}

/* ---------- secrets (OS 보관소로 암호화: Windows DPAPI / macOS Keychain) ----------
 * Electron 45부터 동기 safeStorage API는 사용 중단(46에서 제거)이라 비동기 API를 쓴다.
 * 예전 동기 API로 암호화해 둔 값도 비동기 API로 그대로 풀린다.
 */

export async function setSecret(ownerId: string, value: string): Promise<void> {
  if (!value) {
    db.prepare('DELETE FROM secrets WHERE owner_id = ?').run(ownerId)
    return
  }
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('OS 암호화 저장소를 사용할 수 없습니다')
  const enc = await safeStorage.encryptStringAsync(value)
  db.prepare('INSERT OR REPLACE INTO secrets (owner_id, enc) VALUES (?, ?)').run(ownerId, enc)
}

export async function getSecret(ownerId: string): Promise<string | null> {
  const row = db.prepare('SELECT enc FROM secrets WHERE owner_id = ?').get(ownerId) as { enc: Buffer } | undefined
  if (!row) return null
  let decrypted: Awaited<ReturnType<typeof safeStorage.decryptStringAsync>>
  try {
    decrypted = await safeStorage.decryptStringAsync(row.enc)
  } catch {
    // 앱 이름이 바뀌어 macOS 키체인 항목이 달라졌거나 다른 PC에서 옮겨 온 DB:
    // 풀 수 없는 값은 지우고, 접속할 때 비밀번호를 다시 묻게 한다
    db.prepare('DELETE FROM secrets WHERE owner_id = ?').run(ownerId)
    return null
  }
  const { result, shouldReEncrypt } = decrypted
  // OS 쪽 키가 바뀌었으면 새 키로 다시 암호화해 저장
  if (shouldReEncrypt) await setSecret(ownerId, result)
  return result
}

/* ---------- known_hosts ---------- */

export function getKnownHost(host: string, port: number): { keyType: string; fingerprint: string } | undefined {
  return db
    .prepare('SELECT key_type AS keyType, fingerprint FROM known_hosts WHERE host = ? AND port = ?')
    .get(host, port) as { keyType: string; fingerprint: string } | undefined
}

export function saveKnownHost(host: string, port: number, keyType: string, fingerprint: string): void {
  db.prepare('INSERT OR REPLACE INTO known_hosts VALUES (?, ?, ?, ?, ?)').run(host, port, keyType, fingerprint, Date.now())
}

/* ---------- snippets ---------- */

export function listSnippets(): Snippet[] {
  return db.prepare('SELECT id, name, command FROM snippets ORDER BY sort_order, name').all() as Snippet[]
}

export function saveSnippet(s: Omit<Snippet, 'id'> & { id?: string }): string {
  const id = s.id ?? randomUUID()
  db.prepare(
    `INSERT INTO snippets (id, name, command) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, command = excluded.command`
  ).run(id, s.name, s.command)
  return id
}

export function deleteSnippet(id: string): void {
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id)
}

/* ---------- settings ---------- */

export const DEFAULT_SETTINGS: AppSettings = {
  appTheme: 'dark',
  uiFontSize: 13,
  terminalTheme: 'Dari Dark',
  fontFamily: process.platform === 'darwin' ? 'Menlo' : 'Consolas',
  fontSize: 14,
  lineHeight: 1.1,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  defaultUsername: '',
  defaultPort: 22,
  defaultKeyPath: '',
  defaultEncoding: 'utf-8',
  keepaliveSec: 30,
  connectTimeoutSec: 20,
  showHidden: true,
  downloadDir: '',
  confirmOverwrite: true,
  editorPath: '',
  autoReconnect: true,
  logDir: ''
}

export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const saved = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  if (saved.terminalTheme === 'AwsTerm Dark') saved.terminalTheme = 'Dari Dark' // 예전 이름
  return { ...DEFAULT_SETTINGS, ...saved }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const up = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) up.run(k, JSON.stringify(v))
  })()
  return getSettings()
}
