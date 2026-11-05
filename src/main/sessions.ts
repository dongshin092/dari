import { BrowserWindow } from 'electron'
import { createWriteStream, type WriteStream } from 'node:fs'
import type { SFTPWrapper } from 'ssh2'
import type { TerminalExit } from '@shared/types'

/** 터미널 하나(SSH 셸 또는 SSM pty)를 추상화한 백엔드 */
export interface TerminalBackend {
  write(data: string): void
  resize(cols: number, rows: number): void
  close(): void
  sftp?: SFTPWrapper
}

interface Entry {
  backend: TerminalBackend
  log?: WriteStream
  /** 세션이 닫힐 때 정리할 것들 (편집 파일 감시 등) */
  cleanups: (() => void)[]
}

const sessions = new Map<string, Entry>()

export function registerSession(id: string, backend: TerminalBackend): void {
  sessions.set(id, { backend, cleanups: [] })
}

function entry(id: string): Entry {
  const s = sessions.get(id)
  if (!s) throw new Error(`세션을 찾을 수 없습니다: ${id}`)
  return s
}

export function getSession(id: string): TerminalBackend {
  return entry(id).backend
}

export function onSessionClose(id: string, fn: () => void): void {
  entry(id).cleanups.push(fn)
}

function disposeEntry(id: string): void {
  const e = sessions.get(id)
  if (!e) return
  for (const fn of e.cleanups) {
    try {
      fn()
    } catch {
      /* 정리 중 오류는 무시 */
    }
  }
  e.log?.end()
  sessions.delete(id)
}

export function closeAllSessions(): void {
  for (const [id, e] of sessions) {
    e.backend.close()
    disposeEntry(id)
  }
}

/* ---------- 세션 로그 ---------- */

// 색상·커서 이동 같은 제어 문자를 빼고 읽을 수 있는 텍스트만 남긴다
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\r(?!\n)/g

export function startLog(id: string, path: string): void {
  const e = entry(id)
  e.log?.end()
  e.log = createWriteStream(path, { flags: 'a' })
  e.log.write(`\n===== ${new Date().toLocaleString()} 로그 시작 =====\n`)
}

export function stopLog(id: string): void {
  const e = sessions.get(id)
  if (!e?.log) return
  e.log.write(`\n===== ${new Date().toLocaleString()} 로그 끝 =====\n`)
  e.log.end()
  e.log = undefined
}

/* ---------- renderer로 이벤트 전송 ---------- */

export function emit(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, ...args)
}

export function emitData(sessionId: string, data: string): void {
  sessions.get(sessionId)?.log?.write(data.replace(ANSI, ''))
  emit('term:data', sessionId, data)
}

export function emitExit(sessionId: string, exit: TerminalExit): void {
  if (!sessions.has(sessionId)) return // 이미 처리됨
  disposeEntry(sessionId)
  emit('term:exit', sessionId, exit)
}
