import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  EditSession,
  Snippet,
  TerminalExit,
  AuthPrompt,
  AuthPromptReply,
  Folder,
  Host,
  HostInput,
  SftpEntry,
  TerminalOpenResult
} from '@shared/types'

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  // Electron 45: 샌드박스 preload의 ipcRenderer는 on/once/off/emit만 보장된다
  return () => ipcRenderer.off(channel, listener)
}

const api = {
  db: {
    listFolders: (): Promise<Folder[]> => ipcRenderer.invoke('db:listFolders'),
    saveFolder: (name: string, parentId: string | null, id?: string): Promise<string> =>
      ipcRenderer.invoke('db:saveFolder', name, parentId, id),
    deleteFolder: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteFolder', id),
    listHosts: (): Promise<Host[]> => ipcRenderer.invoke('db:listHosts'),
    saveHost: (h: HostInput): Promise<string> => ipcRenderer.invoke('db:saveHost', h),
    deleteHost: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteHost', id)
  },
  term: {
    openHost: (hostId: string): Promise<TerminalOpenResult> => ipcRenderer.invoke('term:openHost', hostId),
    write: (id: string, data: string) => ipcRenderer.send('term:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('term:resize', id, cols, rows),
    close: (id: string) => ipcRenderer.send('term:close', id),
    onData: (cb: (id: string, data: string) => void) => on('term:data', cb),
    onExit: (cb: (id: string, exit: TerminalExit) => void) => on('term:exit', cb)
  },
  sftp: {
    realpath: (id: string, p: string): Promise<string> => ipcRenderer.invoke('sftp:realpath', id, p),
    list: (id: string, dir: string): Promise<SftpEntry[]> => ipcRenderer.invoke('sftp:list', id, dir),
    download: (id: string, remote: string): Promise<string | null> => ipcRenderer.invoke('sftp:download', id, remote),
    upload: (id: string, dir: string, localPaths: string[]): Promise<number> =>
      ipcRenderer.invoke('sftp:upload', id, dir, localPaths),
    rename: (id: string, from: string, to: string): Promise<void> => ipcRenderer.invoke('sftp:rename', id, from, to),
    mkdir: (id: string, path: string): Promise<void> => ipcRenderer.invoke('sftp:mkdir', id, path),
    chmod: (id: string, path: string, mode: number): Promise<void> => ipcRenderer.invoke('sftp:chmod', id, path, mode),
    remove: (id: string, path: string, isDir: boolean): Promise<void> =>
      ipcRenderer.invoke('sftp:remove', id, path, isDir),
    editLocal: (id: string, path: string): Promise<EditSession> => ipcRenderer.invoke('sftp:editLocal', id, path),
    /** 드래그앤드롭된 File 객체의 실제 경로 */
    pathForFile: (f: File): string => webUtils.getPathForFile(f),
    onProgress: (cb: (id: string, p: { file: string; transferred: number; total: number }) => void) =>
      on('sftp:progress', cb)
  },
  log: {
    start: (id: string, title: string, path?: string): Promise<string | null> =>
      ipcRenderer.invoke('log:start', id, title, path),
    stop: (id: string): Promise<void> => ipcRenderer.invoke('log:stop', id)
  },
  snippets: {
    list: (): Promise<Snippet[]> => ipcRenderer.invoke('snippet:list'),
    save: (s: Omit<Snippet, 'id'> & { id?: string }): Promise<string> => ipcRenderer.invoke('snippet:save', s),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('snippet:delete', id)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:save', patch),
    pickEditor: (): Promise<string | null> => ipcRenderer.invoke('settings:pickEditor'),
    pickPath: (kind: 'file' | 'folder'): Promise<string | null> => ipcRenderer.invoke('settings:pickPath', kind),
    reset: (keys: (keyof AppSettings)[]): Promise<AppSettings> => ipcRenderer.invoke('settings:reset', keys)
  },
  auth: {
    onPrompt: (cb: (req: AuthPrompt) => void) => on('auth:prompt', cb),
    reply: (id: string, reply: AuthPromptReply | null) => ipcRenderer.send('auth:reply', id, reply)
  },
  onToast: (cb: (msg: string) => void) => on('app:toast', cb)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
