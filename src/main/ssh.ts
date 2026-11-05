import { Client, type ConnectConfig } from 'ssh2'
import { dialog, BrowserWindow } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Host, HostKeyPrompt, TerminalOpenResult } from '@shared/types'
import iconv from 'iconv-lite'
import { getKnownHost, getSecret, getSettings, saveKnownHost, setSecret } from './db'
import { askUser } from './prompt'
import { emitData, emitExit, registerSession } from './sessions'

/** 서버 공개키 blob에서 키 종류(ssh-ed25519 등)를 읽는다 */
function keyTypeOf(key: Buffer): string {
  const len = key.readUInt32BE(0)
  return key.subarray(4, 4 + len).toString('ascii')
}

/** 처음 보는 호스트이거나 지문이 바뀌면 사용자에게 확인받는다 */
async function confirmHostKey(p: HostKeyPrompt): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const message = p.changed
    ? `⚠ ${p.host}:${p.port} 의 호스트 키가 저장된 값과 다릅니다.\n중간자 공격일 수 있습니다. 서버를 재설치한 게 확실할 때만 계속하세요.`
    : `${p.host}:${p.port} 에 처음 접속합니다.`
  const { response } = await dialog.showMessageBox(win, {
    type: p.changed ? 'warning' : 'question',
    title: '호스트 키 확인',
    message,
    detail: `${p.keyType}\nSHA256:${p.fingerprint}`,
    buttons: ['취소', p.changed ? '새 키로 교체하고 접속' : '저장하고 접속'],
    defaultId: 0,
    cancelId: 0
  })
  return response === 1
}

async function askPassword(host: Host, title: string): Promise<{ value: string; save: boolean }> {
  const r = await askUser({
    title: `${host.label} · ${title}`,
    prompts: [{ prompt: `${host.username}@${host.hostname}`, echo: false }],
    allowSave: true
  })
  if (!r) throw new Error('접속을 취소했습니다')
  return { value: r.answers[0] ?? '', save: r.save }
}

/**
 * 연결 한 번 시도.
 * password 방식이라도 많은 서버(Ubuntu 기본값 등)는 keyboard-interactive로만 비밀번호를 받으므로 둘 다 시도한다.
 */
function connectOnce(base: ConnectConfig, password: string | undefined): Promise<Client> {
  const client = new Client()
  const config: ConnectConfig = { ...base, tryKeyboard: password !== undefined }
  if (password !== undefined) config.password = password
  let pwUsedForKbd = false

  client.on('keyboard-interactive', (_name, instructions, _lang, prompts, finish) => {
    if (prompts.length === 0) return finish([])
    // 비밀번호 한 칸만 묻는 경우는 입력해 둔 값으로 자동 응답 (한 번만)
    if (password !== undefined && !pwUsedForKbd && prompts.length === 1 && !prompts[0].echo) {
      pwUsedForKbd = true
      return finish([password])
    }
    // OTP 등 그 외 질문은 사용자에게 묻는다
    askUser({
      title: `${base.host} · 추가 인증`,
      instructions,
      prompts: prompts.map((p) => ({ prompt: p.prompt, echo: !!p.echo })),
      allowSave: false
    })
      .then((r) => finish(r ? r.answers : prompts.map(() => '')))
      .catch(() => finish(prompts.map(() => '')))
  })

  return new Promise((resolve, reject) => {
    client.once('ready', () => {
      client.removeAllListeners('error')
      resolve(client)
    })
    client.once('error', reject)
    client.connect(config)
  })
}

export async function openSsh(host: Host): Promise<TerminalOpenResult> {
  const settings = getSettings()
  const secret = await getSecret(host.id)
  const config: ConnectConfig = {
    host: host.hostname,
    port: host.port,
    username: host.username,
    readyTimeout: settings.connectTimeoutSec * 1000,
    keepaliveInterval: settings.keepaliveSec * 1000, // 0이면 끔
    hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
      const fingerprint = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
      const keyType = keyTypeOf(key)
      const known = getKnownHost(host.hostname, host.port)
      if (known && known.fingerprint === fingerprint) return verify(true)
      confirmHostKey({ host: host.hostname, port: host.port, keyType, fingerprint, changed: !!known })
        .then((ok) => {
          if (ok) saveKnownHost(host.hostname, host.port, keyType, fingerprint)
          verify(ok)
        })
        .catch(() => verify(false))
    }
  }

  let password: string | undefined
  let toSave: string | undefined

  if (host.authType === 'key') {
    if (!host.keyPath) throw new Error('키 파일 경로가 없습니다')
    config.privateKey = await readFile(host.keyPath)
    if (secret) config.passphrase = secret
  } else {
    password = secret ?? undefined
    if (!password) {
      // 저장된 비밀번호가 없으면 접속할 때 묻는다
      const r = await askPassword(host, '비밀번호를 입력하세요')
      password = r.value
      if (r.save) toSave = r.value
    }
  }

  const sessionId = randomUUID()
  let client: Client
  try {
    client = await connectOnce(config, password)
  } catch (e) {
    const err = e as Error & { level?: string }
    if (host.authType === 'key' && /passphrase/i.test(err.message)) {
      // 암호화된 키인데 패스프레이즈가 없거나 틀림
      const r = await askPassword(host, '키 패스프레이즈를 입력하세요')
      config.passphrase = r.value
      if (r.save) toSave = r.value
      client = await connectOnce(config, undefined)
    } else if (host.authType === 'password' && err.level === 'client-authentication') {
      // 저장된 비밀번호가 틀렸을 수 있으니 한 번 더 묻는다
      const r = await askPassword(host, '인증에 실패했습니다. 비밀번호를 다시 입력하세요')
      password = r.value
      if (r.save) toSave = r.value
      client = await connectOnce(config, password).catch((e2: Error & { level?: string }) => {
        throw e2.level === 'client-authentication' ? new Error('인증 실패: 사용자 이름이나 비밀번호를 확인하세요') : e2
      })
    } else if (err.level === 'client-authentication') {
      throw new Error('인증 실패: 서버가 이 인증 방식을 허용하지 않거나 키/계정이 맞지 않습니다')
    } else {
      throw err
    }
  }
  if (toSave) await setSecret(host.id, toSave)

  const stream = await new Promise<import('ssh2').ClientChannel>((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, ch) => (err ? reject(err) : resolve(ch)))
  })

  // SFTP는 같은 연결 위에 채널만 하나 더 연다 (재인증 없음)
  const sftp = await new Promise<import('ssh2').SFTPWrapper | undefined>((resolve) => {
    client.sftp((err, s) => resolve(err ? undefined : s))
  })

  // 끊긴 이유 구분: 원격 셸이 exit 했거나 사용자가 탭을 닫았으면 정상 종료, 그 외(네트워크·keepalive)는 끊김
  let normalExit = false
  let lastError: string | null = null

  // 서버 인코딩에 맞춰 바이트 ↔ 문자 변환. 디코더는 패킷 경계에서 잘린 한글 바이트를 이어 붙여 준다
  const enc = host.encoding === 'cp949' ? 'cp949' : 'utf8'
  const outDecoder = iconv.getDecoder(enc)
  const errDecoder = iconv.getDecoder(enc)
  stream.on('data', (d: Buffer) => emitData(sessionId, outDecoder.write(d)))
  stream.stderr.on('data', (d: Buffer) => emitData(sessionId, errDecoder.write(d)))
  stream.on('exit', () => {
    normalExit = true
  })
  stream.on('close', () => {
    client.end()
    emitExit(sessionId, normalExit
      ? { reason: '세션이 종료되었습니다', dropped: false }
      : { reason: `연결이 끊겼습니다${lastError ? `: ${lastError}` : ''}`, dropped: true })
  })
  client.on('error', (e) => {
    lastError = e.message
  })
  client.on('close', () => {
    // 셸 채널 close 없이 TCP가 끊긴 경우
    emitExit(sessionId, normalExit
      ? { reason: '세션이 종료되었습니다', dropped: false }
      : { reason: `연결이 끊겼습니다${lastError ? `: ${lastError}` : ''}`, dropped: true })
  })

  registerSession(sessionId, {
    write: (d) => stream.write(enc === 'utf8' ? d : iconv.encode(d, enc)),
    resize: (cols, rows) => stream.setWindow(rows, cols, 0, 0),
    close: () => {
      normalExit = true
      client.end()
    },
    sftp
  })

  return { sessionId, title: host.label, sftp: !!sftp }
}
