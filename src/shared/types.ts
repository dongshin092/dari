// main ↔ renderer 공용 타입

export type AuthType = 'password' | 'key'
/** 서버 문자 인코딩. cp949는 EUC-KR의 확장(똠, 햏 같은 글자 포함) */
export type Encoding = 'utf-8' | 'cp949'
export type HostSource = 'local' | 'team'

export interface Folder {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
}

export interface Host {
  id: string
  folderId: string | null
  label: string
  hostname: string
  port: number
  username: string
  authType: AuthType
  keyPath: string | null
  source: HostSource
  encoding: Encoding
}

/** 저장할 때만 쓰는 입력 (비밀번호·패스프레이즈는 OS 보관소로 간다) */
export interface HostInput extends Omit<Host, 'id' | 'source'> {
  id?: string
  secret?: string
}

export interface TerminalOpenResult {
  sessionId: string
  title: string
  /** SFTP 사용 가능 여부 */
  sftp: boolean
}

export interface TerminalExit {
  reason: string
  /** 사용자가 exit 한 게 아니라 네트워크 등으로 끊긴 경우 true → 자동 재접속 대상 */
  dropped: boolean
}

export interface Snippet {
  id: string
  name: string
  command: string
}

export type AppTheme = 'dark' | 'light' | 'system'
export type CursorStyle = 'block' | 'bar' | 'underline'

export interface AppSettings {
  /* 화면 */
  appTheme: AppTheme
  /** 사이드바·메뉴 글자 크기 (px) */
  uiFontSize: number
  /* 터미널 */
  /** themes.ts 의 터미널 색 테마 이름 */
  terminalTheme: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  /* 접속 기본값 (새 서버 등록 시) */
  defaultUsername: string
  defaultPort: number
  defaultKeyPath: string
  defaultEncoding: Encoding
  /** 연결 유지 신호 간격 (초, 0이면 끔) */
  keepaliveSec: number
  /** 접속 대기 시간 (초) */
  connectTimeoutSec: number
  /* SFTP */
  /** 이름이 . 으로 시작하는 파일 표시 */
  showHidden: boolean
  /** 비우면 다운로드할 때마다 저장 위치를 묻는다 */
  downloadDir: string
  /** 업로드할 때 같은 이름 파일이 있으면 묻기 */
  confirmOverwrite: boolean
  /* 파일 편집 */
  /** 원격 파일 편집에 쓸 에디터 실행 파일 (비우면 OS 기본 연결 프로그램) */
  editorPath: string
  /** 연결이 끊기면 자동으로 다시 접속 */
  autoReconnect: boolean
  /** 세션 로그 기본 저장 폴더 (비우면 문서/Dari Logs) */
  logDir: string
}

export interface EditSession {
  localPath: string
  remotePath: string
}

export interface SftpEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
  /** 권한 비트 (예: 0o644) */
  mode: number
}

/** 접속 중 비밀번호·OTP 등을 사용자에게 묻는 요청 */
export interface AuthPrompt {
  id: string
  title: string
  /** 서버가 보낸 안내문 (keyboard-interactive) */
  instructions?: string
  prompts: { prompt: string; echo: boolean }[]
  /** "저장" 체크박스를 보여줄지 (비밀번호일 때만) */
  allowSave: boolean
}

export interface AuthPromptReply {
  answers: string[]
  save: boolean
}

export interface HostKeyPrompt {
  host: string
  port: number
  keyType: string
  fingerprint: string
  /** 이미 저장된 지문과 다를 때 true (중간자 공격 가능성) */
  changed: boolean
}
