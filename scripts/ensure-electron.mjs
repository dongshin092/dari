// Electron 44부터는 npm install 때 실행 파일을 자동으로 내려받지 않는다.
// electron-vite는 실행 파일이 없으면 "Electron uninstall" 오류만 내고 멈추므로,
// 설치 직후와 npm run dev 전에 이 스크립트로 확인하고 없으면 내려받는다.
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronDir = dirname(require.resolve('electron/package.json'))
const pathTxt = join(electronDir, 'path.txt')

const installed = () =>
  existsSync(pathTxt) && existsSync(join(electronDir, 'dist', readFileSync(pathTxt, 'utf8').trim()))

if (installed()) process.exit(0)

const { version } = require('electron/package.json')
console.log(`[ensure-electron] Electron ${version} 실행 파일을 내려받는 중입니다 (처음 한 번, 100MB 정도)...`)

const env = { ...process.env }
delete env.ELECTRON_SKIP_BINARY_DOWNLOAD // 이 변수가 남아 있으면 다운로드를 건너뛴다
const r = spawnSync(process.execPath, [join(electronDir, 'install.js')], { stdio: 'inherit', env })

if (r.status !== 0 || !installed()) {
  console.error(`
[ensure-electron] Electron 다운로드에 실패했습니다.
  - 회사망·프록시 때문에 GitHub 접속이 막힌 경우 미러를 지정하고 다시 실행하세요.
      PowerShell:  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
      macOS:       export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
      그다음:      node scripts/ensure-electron.mjs
  - 그래도 안 되면 node_modules/electron 폴더를 지우고 npm install 을 다시 실행하세요.
`)
  process.exit(1)
}
console.log('[ensure-electron] 완료')
