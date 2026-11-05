import { app, BrowserWindow, Menu, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { closeAllSessions } from './sessions'

// 개발 실행과 설치본이 같은 데이터 폴더를 쓰도록 고정
// (Windows: %APPDATA%\dari, macOS: ~/Library/Application Support/dari)
const dataDir = join(app.getPath('appData'), 'dari')
// 예전 이름(AwsTerm) 시절 데이터가 있으면 한 번만 옮겨 온다
const oldDir = join(app.getPath('appData'), 'awsterm')
if (!existsSync(dataDir) && existsSync(join(oldDir, 'awsterm.db'))) {
  mkdirSync(dataDir, { recursive: true })
  for (const f of ['awsterm.db', 'awsterm.db-wal', 'awsterm.db-shm']) {
    if (existsSync(join(oldDir, f))) copyFileSync(join(oldDir, f), join(dataDir, f.replace('awsterm', 'dari')))
  }
}
app.setPath('userData', dataDir)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    title: 'Dari',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 보안 기본값: renderer에는 Node API를 주지 않는다
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  // 외부 링크는 기본 브라우저로, 앱 안에서는 새 창·이동을 막는다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  // 개발 중에는 F12로 개발자 도구
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
    })
  }

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 기본 메뉴의 '확대/축소'(Ctrl + = / -)가 앱 전체를 키우므로 메뉴를 직접 정한다.
 * 그 단축키는 터미널 글자 크기 조절에 쓴다.
 * macOS는 Cmd+C/V가 메뉴를 통해 동작하므로 편집 메뉴를 남긴다.
 */
function setupMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))
  } else {
    Menu.setApplicationMenu(null)
  }
}

app.whenReady().then(() => {
  setupMenu()
  initDb()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeAllSessions()
  if (process.platform !== 'darwin') app.quit()
})
