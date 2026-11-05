import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppSettings, HostInput, Snippet } from '@shared/types'
import * as db from './db'
import * as sftp from './sftp'
import { openSsh } from './ssh'
import { getSession, startLog, stopLog } from './sessions'

/**
 * renderer에서 오는 요청은 모두 여기서만 처리한다.
 * preload는 이 채널 이름만 노출하고, Node API는 renderer에 직접 주지 않는다.
 */
export function registerIpc(): void {
  // 세션 저장소
  ipcMain.handle('db:listFolders', () => db.listFolders())
  ipcMain.handle('db:saveFolder', (_e, name: string, parentId: string | null, id?: string) => db.saveFolder(name, parentId, id))
  ipcMain.handle('db:deleteFolder', (_e, id: string) => db.deleteFolder(id))
  ipcMain.handle('db:listHosts', () => db.listHosts())
  ipcMain.handle('db:saveHost', (_e, h: HostInput) => db.saveHost(h))
  ipcMain.handle('db:deleteHost', (_e, id: string) => db.deleteHost(id))

  // 터미널
  ipcMain.handle('term:openHost', async (_e, hostId: string) => {
    const host = db.getHost(hostId)
    if (!host) throw new Error('호스트가 없습니다')
    return openSsh(host)
  })
  // 끊긴 세션에 늦게 도착한 입력은 조용히 버린다
  ipcMain.on('term:write', (_e, id: string, data: string) => {
    try {
      getSession(id).write(data)
    } catch {
      /* 닫힌 세션 */
    }
  })
  ipcMain.on('term:resize', (_e, id: string, cols: number, rows: number) => {
    try {
      getSession(id).resize(cols, rows)
    } catch {
      /* 닫힌 세션 */
    }
  })
  ipcMain.on('term:close', (_e, id: string) => {
    try {
      getSession(id).close()
    } catch {
      /* 이미 닫힘 */
    }
  })

  // SFTP
  ipcMain.handle('sftp:realpath', (_e, id: string, p: string) => sftp.realpath(id, p))
  ipcMain.handle('sftp:list', (_e, id: string, dir: string) => sftp.list(id, dir))
  ipcMain.handle('sftp:download', (_e, id: string, remote: string) => sftp.download(id, remote))
  ipcMain.handle('sftp:upload', (_e, id: string, dir: string, locals: string[]) => sftp.upload(id, dir, locals))
  ipcMain.handle('sftp:rename', (_e, id: string, from: string, to: string) => sftp.rename(id, from, to))
  ipcMain.handle('sftp:mkdir', (_e, id: string, p: string) => sftp.mkdir(id, p))
  ipcMain.handle('sftp:chmod', (_e, id: string, p: string, mode: number) => sftp.chmod(id, p, mode))
  ipcMain.handle('sftp:remove', (_e, id: string, p: string, isDir: boolean) => sftp.remove(id, p, isDir))
  ipcMain.handle('sftp:editLocal', (_e, id: string, p: string) => sftp.editLocal(id, p))

  // 세션 로그: path를 주면 그 파일에 이어 쓰고(재접속 시), 없으면 저장 위치를 묻는다
  ipcMain.handle('log:start', async (_e, id: string, title: string, path?: string) => {
    let file = path
    if (!file) {
      const dir = db.getSettings().logDir || join(app.getPath('documents'), 'Dari Logs')
      await mkdir(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
      const safe = title.replace(/[\\/:*?"<>|]/g, '_')
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: join(dir, `${safe}_${stamp}.log`),
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
      })
      if (r.canceled || !r.filePath) return null
      file = r.filePath
    }
    startLog(id, file)
    return file
  })
  ipcMain.handle('log:stop', (_e, id: string) => stopLog(id))

  // 스니펫·설정
  ipcMain.handle('snippet:list', () => db.listSnippets())
  ipcMain.handle('snippet:save', (_e, s: Omit<Snippet, 'id'> & { id?: string }) => db.saveSnippet(s))
  ipcMain.handle('snippet:delete', (_e, id: string) => db.deleteSnippet(id))
  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:save', (_e, patch: Partial<AppSettings>) => db.saveSettings(patch))
  ipcMain.handle('settings:reset', (_e, keys: (keyof AppSettings)[]) =>
    db.saveSettings(Object.fromEntries(keys.map((k) => [k, db.DEFAULT_SETTINGS[k]])))
  )
  // 파일·폴더 선택 (설정 화면의 '찾기' 버튼)
  ipcMain.handle('settings:pickPath', async (_e, kind: 'file' | 'folder') => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const r = await dialog.showOpenDialog(win!, {
      properties: kind === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile', 'showHiddenFiles']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('settings:pickEditor', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: '프로그램', extensions: ['exe', 'cmd', 'bat'] }] : []
    })
    return r.canceled ? null : r.filePaths[0]
  })
}
