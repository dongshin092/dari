import { dialog, BrowserWindow, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { watch, type FSWatcher } from 'node:fs'
import { existsSync } from 'node:fs'
import { mkdir as mkdirLocal } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, posix } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { EditSession, SftpEntry } from '@shared/types'
import { getSettings } from './db'
import { emit, getSession, onSessionClose } from './sessions'

function sftpOf(sessionId: string): SFTPWrapper {
  const s = getSession(sessionId).sftp
  if (!s) throw new Error('이 세션은 SFTP를 지원하지 않습니다')
  return s
}

/** 콜백 스타일 SFTP 호출을 Promise로 */
function call<T = void>(fn: (cb: (err: Error | null | undefined, v?: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v as T))))
}

export function realpath(sessionId: string, path: string): Promise<string> {
  const sftp = sftpOf(sessionId)
  return call<string>((cb) => sftp.realpath(path, cb))
}

export async function list(sessionId: string, dir: string): Promise<SftpEntry[]> {
  const sftp = sftpOf(sessionId)
  const items = await call<import('ssh2').FileEntryWithStats[]>((cb) => sftp.readdir(dir, cb))
  return items
    .filter((i) => i.filename !== '.' && i.filename !== '..')
    .map((i) => ({
      name: i.filename,
      path: posix.join(dir, i.filename),
      isDir: i.attrs.isDirectory(),
      size: i.attrs.size,
      mtime: i.attrs.mtime * 1000,
      mode: i.attrs.mode & 0o7777
    }))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
}

/* ---------- 파일 관리 ---------- */

export function rename(sessionId: string, from: string, to: string): Promise<void> {
  const sftp = sftpOf(sessionId)
  return call((cb) => sftp.rename(from, to, cb))
}

export function mkdir(sessionId: string, path: string): Promise<void> {
  const sftp = sftpOf(sessionId)
  return call((cb) => sftp.mkdir(path, cb))
}

export function chmod(sessionId: string, path: string, mode: number): Promise<void> {
  const sftp = sftpOf(sessionId)
  return call((cb) => sftp.chmod(path, mode, cb))
}

/** 파일은 그대로, 폴더는 안의 내용까지 지운다 */
export async function remove(sessionId: string, path: string, isDir: boolean): Promise<void> {
  const sftp = sftpOf(sessionId)
  if (!isDir) return call((cb) => sftp.unlink(path, cb))
  for (const child of await list(sessionId, path)) {
    await remove(sessionId, child.path, child.isDir)
  }
  await call((cb) => sftp.rmdir(path, cb))
}

/* ---------- 전송 ---------- */

function progress(sessionId: string, file: string) {
  return (transferred: number, _chunk: number, total: number) =>
    emit('sftp:progress', sessionId, { file, transferred, total })
}

function getFile(sftp: SFTPWrapper, sessionId: string, remote: string, local: string): Promise<void> {
  return call((cb) => sftp.fastGet(remote, local, { step: progress(sessionId, remote) }, cb))
}

function putFile(sftp: SFTPWrapper, sessionId: string, local: string, remote: string): Promise<void> {
  return call((cb) => sftp.fastPut(local, remote, { step: progress(sessionId, remote) }, cb))
}

/** 같은 이름이 있으면 "이름 (1).확장자" 식으로 비어 있는 이름을 찾는다 */
function uniqueLocalPath(dir: string, name: string): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let p = join(dir, name)
  for (let i = 1; existsSync(p); i++) p = join(dir, `${stem} (${i})${ext}`)
  return p
}

export async function download(sessionId: string, remotePath: string): Promise<string | null> {
  const sftp = sftpOf(sessionId)
  const { downloadDir } = getSettings()
  let filePath: string | undefined
  if (downloadDir) {
    // 기본 다운로드 폴더가 정해져 있으면 묻지 않고 바로 저장
    await mkdirLocal(downloadDir, { recursive: true })
    filePath = uniqueLocalPath(downloadDir, posix.basename(remotePath))
  } else {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const r = await dialog.showSaveDialog(win!, { defaultPath: posix.basename(remotePath) })
    if (r.canceled || !r.filePath) return null
    filePath = r.filePath
  }
  await getFile(sftp, sessionId, remotePath, filePath)
  return filePath
}

function remoteExists(sftp: SFTPWrapper, path: string): Promise<boolean> {
  return new Promise((resolve) => sftp.stat(path, (err) => resolve(!err)))
}

/** localPaths가 비어 있으면 파일 선택 창을 띄운다 (드래그앤드롭은 경로를 바로 넘긴다) */
export async function upload(sessionId: string, remoteDir: string, localPaths: string[]): Promise<number> {
  const sftp = sftpOf(sessionId)
  let files = localPaths
  if (files.length === 0) {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return 0
    files = r.filePaths
  }
  const { confirmOverwrite } = getSettings()
  let overwriteAll = !confirmOverwrite
  let count = 0
  for (const local of files) {
    const remote = posix.join(remoteDir, basename(local))
    if (!overwriteAll && (await remoteExists(sftp, remote))) {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: '같은 이름의 파일',
        message: `'${basename(local)}' 파일이 이미 있습니다. 덮어쓸까요?`,
        detail: remote,
        buttons: ['덮어쓰기', '모두 덮어쓰기', '건너뛰기', '업로드 취소'],
        defaultId: 2,
        cancelId: 3
      })
      if (response === 3) break
      if (response === 2) continue
      if (response === 1) overwriteAll = true
    }
    await putFile(sftp, sessionId, local, remote)
    count++
  }
  return count
}

/* ---------- 로컬 에디터로 편집 → 저장하면 자동 업로드 ---------- */

const editing = new Map<string, FSWatcher>() // key: sessionId + remotePath

export async function editLocal(sessionId: string, remotePath: string): Promise<EditSession> {
  const sftp = sftpOf(sessionId)
  const key = `${sessionId}:${remotePath}`
  // 같은 원격 경로는 같은 임시 폴더로 (파일 이름은 원래 이름 유지 → 에디터 문법 강조가 맞게 됨)
  const dir = join(tmpdir(), 'dari-edit', createHash('sha1').update(key).digest('hex').slice(0, 12))
  await mkdirLocal(dir, { recursive: true })
  const localPath = join(dir, posix.basename(remotePath))
  await getFile(sftp, sessionId, remotePath, localPath)

  if (!editing.has(key)) {
    let timer: NodeJS.Timeout | undefined
    let uploading = Promise.resolve()
    // 에디터는 저장할 때 이벤트를 여러 번 내므로 잠깐 모았다가 한 번만 올린다
    const watcher = watch(localPath, () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        uploading = uploading
          .then(() => putFile(sftp, sessionId, localPath, remotePath))
          .then(() => emit('app:toast', `업로드됨: ${remotePath}`))
          .catch((e: Error) => emit('app:toast', `업로드 실패: ${remotePath} (${e.message})`))
      }, 400)
    })
    editing.set(key, watcher)
    onSessionClose(sessionId, () => {
      watcher.close()
      editing.delete(key)
    })
  }

  const { editorPath } = getSettings()
  if (editorPath) {
    // macOS의 .app 번들은 직접 실행할 수 없어 open -a 로 연다
    const [cmd, args] =
      process.platform === 'darwin' && editorPath.endsWith('.app')
        ? ['open', ['-a', editorPath, localPath]]
        : [editorPath, [localPath]]
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
  } else {
    const err = await shell.openPath(localPath)
    if (err) throw new Error(`이 파일을 열 프로그램이 없습니다. 설정에서 에디터를 지정하세요. (${err})`)
  }
  return { localPath, remotePath }
}
