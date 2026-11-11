import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { AppSettings } from '@shared/types'
import { findTheme, fontStack } from '../themes'
import { endQuiet, isQuiet, QUIET_TIMEOUT } from '../cwdHook'

export type TermSettings = Pick<
  AppSettings,
  'terminalTheme' | 'fontFamily' | 'fontSize' | 'lineHeight' | 'cursorStyle' | 'cursorBlink' | 'scrollback'
>

function toOptions(s: TermSettings) {
  return {
    theme: findTheme(s.terminalTheme).colors,
    fontFamily: fontStack(s.fontFamily),
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    scrollback: s.scrollback
  }
}

interface Props {
  /** 재접속해도 같은 터미널(스크롤백 유지)을 쓰도록 탭 단위로 고정 */
  tabId: string
  /** 재접속하면 바뀐다 */
  sessionId: string
  visible: boolean
  focused: boolean
  /** 분할 화면에서의 위치 (0: 왼쪽, 1: 오른쪽) */
  order: number
  onInput: (data: string) => void
  onFocus: () => void
  /** 셸이 OSC 7로 알려준 현재 디렉터리 */
  onCwd: (path: string) => void
  settings: TermSettings
}

export function TerminalView(props: Props) {
  const { sessionId, visible, focused, order } = props
  const el = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  // 콜백은 매 렌더마다 바뀌므로 ref로 최신 값만 참조
  const cb = useRef(props)
  cb.current = props

  // 탭이 처음 생길 때 터미널 한 번만 생성
  useEffect(() => {
    const t = new Terminal(toOptions(cb.current.settings))
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(el.current!)
    term.current = t
    fit.current = f

    // OSC 7: file://host/path → 현재 디렉터리
    const osc = t.parser.registerOscHandler(7, (data) => {
      const m = /^file:\/\/[^/]*(\/.*)$/.exec(data)
      if (m) {
        try {
          cb.current.onCwd(decodeURIComponent(m[1]))
        } catch {
          cb.current.onCwd(m[1])
        }
      }
      return true
    })

    // 복사·붙여넣기 (Windows Terminal과 같은 방식)
    //  - Ctrl+C: 선택한 글자가 있으면 복사, 없으면 그대로 원격에 Ctrl+C(중단) 전송
    //  - Ctrl+V: 클립보드 붙여넣기
    //  - Ctrl+Shift+C / V 도 같이 동작
    // macOS는 Cmd+C/V를 편집 메뉴가 처리하므로 가로채지 않는다
    const isMac = navigator.userAgent.includes('Mac')
    t.attachCustomKeyEventHandler((e) => {
      if (isMac || e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) return true
      if (e.code === 'KeyC') {
        if (!t.hasSelection()) return !e.shiftKey // 선택 없음: Ctrl+C는 원격으로
        e.preventDefault()
        void navigator.clipboard.writeText(t.getSelection())
        t.clearSelection()
        return false
      }
      if (e.code === 'KeyV') {
        e.preventDefault() // 브라우저 기본 붙여넣기와 겹치지 않게
        void navigator.clipboard.readText().then((txt) => txt && t.paste(txt))
        return false
      }
      return true
    })
    t.textarea?.addEventListener('focus', () => cb.current.onFocus())

    const ro = new ResizeObserver(() => {
      if (el.current?.offsetParent) f.fit()
    })
    ro.observe(el.current!)

    return () => {
      ro.disconnect()
      osc.dispose()
      t.dispose()
    }
  }, [])

  // 설정이 바뀌면 열려 있는 터미널에 바로 반영
  const s = props.settings
  useEffect(() => {
    const t = term.current
    if (!t) return
    Object.assign(t.options, toOptions(s))
    requestAnimationFrame(() => {
      if (el.current?.offsetParent) fit.current?.fit()
    })
  }, [s.terminalTheme, s.fontFamily, s.fontSize, s.lineHeight, s.cursorStyle, s.cursorBlink, s.scrollback])

  // 세션 연결 (재접속하면 새 세션으로 다시 연결)
  const first = useRef(true)
  useEffect(() => {
    const t = term.current!
    if (!first.current) t.write('\r\n\x1b[32m[재접속됨]\x1b[0m\r\n')
    first.current = false

    // 따라가기 훅을 넣은 직후: 첫 OSC 7 전까지의 출력(명령 에코)을 숨기고 그 줄을 지운다
    let pending = ''
    let quietTimer: ReturnType<typeof setTimeout> | undefined
    const flushQuiet = (out: string) => {
      endQuiet(sessionId)
      clearTimeout(quietTimer)
      quietTimer = undefined
      pending = ''
      t.write(out)
    }
    const offData = window.api.term.onData((id, data) => {
      if (id !== sessionId) return
      if (!isQuiet(sessionId)) return t.write(data)
      pending += data
      const i = pending.indexOf('\x1b]7;')
      if (i >= 0) flushQuiet('\r\x1b[K' + pending.slice(i))
      else quietTimer ??= setTimeout(() => flushQuiet(pending), QUIET_TIMEOUT)
    })
    const offExit = window.api.term.onExit((id, exit) => {
      if (id === sessionId) t.write(`\r\n\x1b[33m[${exit.reason}]\x1b[0m\r\n`)
    })
    const inSub = t.onData((d) => cb.current.onInput(d))
    const sizeSub = t.onResize(({ cols, rows }) => window.api.term.resize(sessionId, cols, rows))
    fit.current?.fit()
    window.api.term.resize(sessionId, t.cols, t.rows)

    return () => {
      if (quietTimer) flushQuiet(pending)
      offData()
      offExit()
      inSub.dispose()
      sizeSub.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fit.current?.fit())
  }, [visible, order])

  useEffect(() => {
    if (visible && focused) term.current?.focus()
  }, [visible, focused])

  return (
    <div
      ref={el}
      className={`term ${focused ? 'focused' : ''}`}
      style={{ display: visible ? 'block' : 'none', order }}
      onMouseDown={() => props.onFocus()}
    />
  )
}
