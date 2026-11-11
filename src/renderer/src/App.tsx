import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, TerminalOpenResult } from '@shared/types'
import { HostTree } from './components/HostTree'
import { TerminalView } from './components/TerminalView'
import { SftpPanel } from './components/SftpPanel'
import { SnippetPanel } from './components/SnippetPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { AuthPromptDialog } from './components/AuthPromptDialog'
import { AskHost, ask, ContextMenu, type MenuItem } from './components/ui'
import { QuickConnect } from './components/QuickConnect'
import { findTheme } from './themes'

type Connect = () => Promise<TerminalOpenResult>

interface Tab {
  /** 탭 고유 ID (재접속해도 그대로) */
  tabId: string
  sessionId: string
  title: string
  sftp: boolean
  connect: Connect
  status: 'open' | 'reconnecting' | 'closed'
  exitReason?: string
  retries: number
  logPath?: string
  cwd?: string
  /** SFTP 터미널 따라가기 */
  follow?: boolean
  /** 동시 입력 대상 */
  broadcast: boolean
}

type Pane = 0 | 1
const MAX_RETRIES = 3

export function App() {
  const [sideTab, setSideTab] = useState<'hosts' | 'snippets'>('hosts')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [panes, setPanes] = useState<[string | null, string | null]>([null, null])
  const [split, setSplit] = useState(false)
  const [focusedPane, setFocusedPane] = useState<Pane>(0)
  const [broadcastOn, setBroadcastOn] = useState(false)
  const [showSftp, setShowSftp] = useState(true)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  // 이벤트 핸들러에서 최신 상태를 읽기 위한 ref
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // 단축키 핸들러가 항상 최신 함수를 부르도록 (아래에서 매 렌더 갱신)
  const actions = useRef({ newTab: () => {}, duplicate: () => {}, close: () => {}, cycle: (_d: number) => {} })

  const notify = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 5000)
  }, [])

  const patchTab = useCallback((tabId: string, patch: Partial<Tab>) => {
    setTabs((ts) => ts.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)))
  }, [])

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
    return window.api.onToast(notify)
  }, [notify])

  /* ---------- 화면 테마·글자 크기 ---------- */

  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (!settings) return
    const dark = settings.appTheme === 'system' ? systemDark : settings.appTheme === 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.style.fontSize = `${settings.uiFontSize}px`
  }, [settings, systemDark])

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s)) // 화면에 먼저 반영
    setSettings(await window.api.settings.save(patch))
  }, [])

  // Ctrl + = / - / 0 : 터미널 글자 확대·축소·기본값 (Mac은 Cmd)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      // 탭 단축키 (Windows Terminal과 같은 조합)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        actions.current.cycle(e.shiftKey ? -1 : 1)
        return
      }
      if (mod && e.shiftKey && !e.altKey) {
        const act = { KeyT: actions.current.newTab, KeyD: actions.current.duplicate, KeyW: actions.current.close }[e.code]
        if (act) {
          e.preventDefault()
          e.stopPropagation()
          act()
          return
        }
      }
      const cur = settingsRef.current
      if (!mod || e.shiftKey || e.altKey || !cur) return
      if (e.key === ',') {
        e.preventDefault()
        setShowSettings((v) => !v)
        return
      }
      let size: number | null = null
      if (e.key === '=' || e.key === '+') size = Math.min(cur.fontSize + 1, 32)
      else if (e.key === '-') size = Math.max(cur.fontSize - 1, 8)
      else if (e.key === '0') size = 14
      if (size === null) return
      e.preventDefault()
      e.stopPropagation()
      void saveSettings({ fontSize: size })
    }
    window.addEventListener('keydown', onKey, true) // 터미널보다 먼저 받는다
    return () => window.removeEventListener('keydown', onKey, true)
  }, [saveSettings])

  /* ---------- 재접속 ---------- */

  const reconnect = useCallback(
    async (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.tabId === tabId)
      if (!tab) return
      patchTab(tabId, { status: 'reconnecting' })
      try {
        const r = await tab.connect()
        patchTab(tabId, { sessionId: r.sessionId, sftp: r.sftp, status: 'open', retries: 0, exitReason: undefined, cwd: undefined })
        if (tab.logPath) await window.api.log.start(r.sessionId, tab.title, tab.logPath)
      } catch (e) {
        const retries = tab.retries + 1
        const reason = `재접속 실패 (${retries}/${MAX_RETRIES}): ${(e as Error).message}`
        patchTab(tabId, { status: 'closed', exitReason: reason, retries })
        if (retries < MAX_RETRIES && settingsRef.current?.autoReconnect) {
          setTimeout(() => void reconnect(tabId), 3000 * retries)
        }
      }
    },
    [patchTab]
  )

  useEffect(
    () =>
      window.api.term.onExit((sessionId, exit) => {
        const tab = tabsRef.current.find((t) => t.sessionId === sessionId)
        if (!tab) return
        patchTab(tab.tabId, { status: 'closed', exitReason: exit.reason })
        if (exit.dropped && settingsRef.current?.autoReconnect && tab.retries < MAX_RETRIES) {
          setTimeout(() => void reconnect(tab.tabId), 2000)
        }
      }),
    [patchTab, reconnect]
  )

  /* ---------- 탭·화면 분할 ---------- */

  const show = useCallback(
    (tabId: string) => {
      setPanes((p) => {
        const next: [string | null, string | null] = [...p]
        const other: Pane = focusedPane === 0 ? 1 : 0
        // 다른 쪽에 이미 보이는 탭이면 서로 바꾼다
        if (split && next[other] === tabId) next[other] = next[focusedPane]
        next[focusedPane] = tabId
        return next
      })
    },
    [focusedPane, split]
  )

  const open = useCallback(
    async (connect: Connect, opts?: { after?: string; title?: string }) => {
      try {
        const r = await connect()
        const tab: Tab = {
          ...r,
          title: opts?.title ?? r.title,
          tabId: crypto.randomUUID(),
          connect,
          status: 'open',
          retries: 0,
          broadcast: true
        }
        setTabs((ts) => {
          // 복제한 탭은 원래 탭 바로 오른쪽에
          const i = opts?.after ? ts.findIndex((t) => t.tabId === opts.after) : -1
          return i < 0 ? [...ts, tab] : [...ts.slice(0, i + 1), tab, ...ts.slice(i + 1)]
        })
        show(tab.tabId)
      } catch (e) {
        notify(`접속 실패: ${(e as Error).message}`)
      }
    },
    [notify, show]
  )

  /** 같은 서버로 새 탭을 하나 더 열어 바로 접속 */
  const duplicateTab = useCallback(
    (tabId: string) => {
      const src = tabsRef.current.find((t) => t.tabId === tabId)
      if (!src) return
      // "web-01", "web-01 (2)", "web-01 (3)" …
      const base = src.title.replace(/ \(\d+\)$/, '')
      const used = new Set(tabsRef.current.map((t) => t.title))
      let n = 2
      while (used.has(`${base} (${n})`)) n++
      void open(src.connect, { after: tabId, title: `${base} (${n})` })
    },
    [open]
  )

  const closeTab = (tabId: string) => {
    const tab = tabs.find((t) => t.tabId === tabId)
    if (!tab) return
    window.api.term.close(tab.sessionId)
    const rest = tabs.filter((t) => t.tabId !== tabId)
    setTabs(rest)
    setPanes((p) => {
      const used = new Set(p.filter((x) => x && x !== tabId))
      const fill = () => rest.find((t) => !used.has(t.tabId))?.tabId ?? null
      return p.map((x) => (x === tabId ? fill() : x)) as [string | null, string | null]
    })
  }

  const closeOthers = (keep: string) => {
    for (const t of tabs) if (t.tabId !== keep) window.api.term.close(t.sessionId)
    setTabs((ts) => ts.filter((t) => t.tabId === keep))
    setPanes([keep, null])
    setSplit(false)
    setFocusedPane(0)
  }

  const toggleSplit = () => {
    if (split) {
      setSplit(false)
      setPanes((p) => [p[focusedPane], null])
      setFocusedPane(0)
      return
    }
    setSplit(true)
    setPanes((p) => [p[0], tabs.find((t) => t.tabId !== p[0])?.tabId ?? null])
    setFocusedPane(1)
  }

  /* ---------- 입력: 동시 입력이 켜져 있으면 대상 탭 모두에 보낸다 ---------- */

  const sendTo = useCallback(
    (from: Tab | undefined, data: string) => {
      const ts = tabsRef.current
      if (broadcastOn && (!from || from.broadcast)) {
        for (const t of ts) if (t.broadcast && t.status === 'open') window.api.term.write(t.sessionId, data)
      } else if (from && from.status === 'open') {
        window.api.term.write(from.sessionId, data)
      }
    },
    [broadcastOn]
  )

  const activeId = panes[focusedPane]
  const active = tabs.find((t) => t.tabId === activeId)

  actions.current = {
    newTab: () => setShowQuick(true),
    duplicate: () => activeId && duplicateTab(activeId),
    close: () => activeId && closeTab(activeId),
    cycle: (d) => {
      if (tabs.length === 0) return
      const i = tabs.findIndex((t) => t.tabId === activeId)
      show(tabs[(i + d + tabs.length) % tabs.length].tabId)
    }
  }

  /** 스니펫 실행: 동시 입력 중이면 대상 모두, 아니면 활성 탭 */
  const runSnippet = useCallback(
    (text: string) => {
      if (!broadcastOn && !active) return notify('먼저 터미널 탭을 여세요')
      sendTo(broadcastOn ? undefined : active, text)
    },
    [active, broadcastOn, notify, sendTo]
  )

  const toggleLog = async () => {
    if (!active) return
    if (active.logPath) {
      await window.api.log.stop(active.sessionId)
      patchTab(active.tabId, { logPath: undefined })
      notify(`로그 저장 중지: ${active.logPath}`)
    } else {
      const path = await window.api.log.start(active.sessionId, active.title)
      if (path) {
        patchTab(active.tabId, { logPath: path })
        notify(`로그 저장 시작: ${path}`)
      }
    }
  }

  const visibleIds = split ? panes : [panes[0]]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-tabs">
          {(
            [
              ['hosts', '서버'],
              ['snippets', '스니펫']
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={sideTab === k ? 'on' : ''} onClick={() => setSideTab(k)}>
              {label}
            </button>
          ))}
        </div>
        {sideTab === 'hosts' && <HostTree onOpen={open} />}
        {sideTab === 'snippets' && <SnippetPanel onRun={runSnippet} broadcastOn={broadcastOn} />}
        <div className="side-foot">
          <button className="ghost" title="설정 (Ctrl+,)" onClick={() => setShowSettings(true)}>
            ⚙ 설정
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="tabbar">
          {tabs.map((t) => (
            <div
              key={t.tabId}
              className={`tab ${visibleIds.includes(t.tabId) ? 'on' : ''} ${t.tabId === activeId ? 'focus' : ''} ${
                t.status !== 'open' ? 'dead' : ''
              }`}
              onClick={() => show(t.tabId)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(t.tabId) // 가운데 버튼 클릭으로 닫기
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setTabMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: '탭 복제 (새로 접속)   Ctrl+Shift+D', onClick: () => duplicateTab(t.tabId) },
                    { label: '재접속', onClick: () => void reconnect(t.tabId), hidden: t.status === 'open' },
                    {
                      label: '탭 이름 변경',
                      onClick: async () => {
                        const name = await ask({ title: '탭 이름 변경', value: t.title })
                        if (name?.trim()) patchTab(t.tabId, { title: name.trim() })
                      }
                    },
                    { label: '다른 탭 모두 닫기', onClick: () => closeOthers(t.tabId), hidden: tabs.length < 2 },
                    { label: '탭 닫기   Ctrl+Shift+W', onClick: () => closeTab(t.tabId), danger: true }
                  ]
                })
              }}
              title={`${t.title}${t.logPath ? `\n로그 저장 중: ${t.logPath}` : ''}\n우클릭: 복제·이름 변경·닫기`}
            >
              {broadcastOn && (
                <input
                  type="checkbox"
                  title="동시 입력 대상"
                  checked={t.broadcast}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => patchTab(t.tabId, { broadcast: e.target.checked })}
                />
              )}
              {t.logPath && <span className="rec">●</span>}
              <span>{t.title}</span>
              {t.status === 'reconnecting' && <small>재접속 중…</small>}
              <button
                className="x"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.tabId)
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button className="new-tab" title="새 탭 (Ctrl+Shift+T)" onClick={() => setShowQuick(true)}>
            +
          </button>
          <div className="spacer" />
          <button className={`ghost ${split ? 'on' : ''}`} disabled={tabs.length < 2 && !split} onClick={toggleSplit}>
            화면 분할
          </button>
          <button
            className={`ghost ${broadcastOn ? 'warn' : ''}`}
            title="체크한 탭 모두에 같은 입력을 보냅니다"
            onClick={() => setBroadcastOn((b) => !b)}
          >
            {broadcastOn ? '동시 입력 켜짐' : '동시 입력'}
          </button>
          <button className={`ghost ${active?.logPath ? 'on' : ''}`} disabled={!active} onClick={toggleLog}>
            {active?.logPath ? '로그 중지' : '로그 저장'}
          </button>
          {active?.sftp && (
            <button className="ghost" onClick={() => setShowSftp((s) => !s)}>
              SFTP
            </button>
          )}
        </div>

        <div className="workspace">
          <div
            className={`terms ${split ? 'split' : ''}`}
            style={{ background: settings ? findTheme(settings.terminalTheme).colors.background : undefined }}
          >
            {tabs.length === 0 && (
              <div className="empty">
                왼쪽에서 서버를 더블클릭하거나 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> 로 새 탭을 여세요.
              </div>
            )}
            {settings && tabs.map((t) => {
              const pane = visibleIds.indexOf(t.tabId)
              return (
                <TerminalView
                  key={t.tabId}
                  tabId={t.tabId}
                  sessionId={t.sessionId}
                  visible={pane >= 0}
                  order={pane}
                  focused={pane >= 0 && pane === focusedPane}
                  onFocus={() => pane >= 0 && setFocusedPane(pane as Pane)}
                  onInput={(d) => sendTo(t, d)}
                  onCwd={(cwd) => patchTab(t.tabId, { cwd })}
                  settings={settings}
                />
              )
            })}
            {active && active.status === 'closed' && (
              <div className="exit-banner">
                {active.exitReason}
                <button onClick={() => void reconnect(active.tabId)}>재접속</button>
              </div>
            )}
          </div>
          {active?.sftp && showSftp && active.status === 'open' && (
            <SftpPanel
              key={active.sessionId}
              sessionId={active.sessionId}
              cwd={active.cwd}
              notify={notify}
              showHidden={settings?.showHidden ?? true}
              follow={active.follow ?? false}
              onFollowChange={(follow) => patchTab(active.tabId, { follow })}
            />
          )}
        </div>
      </main>

      {showSettings && settings && (
        <SettingsDialog
          settings={settings}
          onSave={saveSettings}
          onReplace={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showQuick && (
        <QuickConnect onPick={(h) => void open(() => window.api.term.openHost(h.id))} onClose={() => setShowQuick(false)} />
      )}
      {tabMenu && <ContextMenu {...tabMenu} onClose={() => setTabMenu(null)} />}
      <AuthPromptDialog />
      <AskHost />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
