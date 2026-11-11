/**
 * "터미널 따라가기"용 셸 훅.
 * 셸이 프롬프트를 띄울 때마다 현재 경로를 OSC 7로 알리게 한다 (bash·zsh).
 *
 * 훅을 넣는 명령이 터미널에 그대로 보이지 않도록, 넣은 직후 OSC 7이 처음 돌아올 때까지의
 * 출력(명령 에코)을 TerminalView가 숨기고 그 줄을 지운다. 일정 시간 안에 OSC 7이 안 오면
 * (sh/csh 등 지원하지 않는 셸) 숨겨 둔 출력을 그대로 보여 준다.
 */
const HOOK =
  ` __dari_cwd(){ printf '\\033]7;file://%s%s\\033\\\\' "\${HOSTNAME:-$(hostname)}" "$PWD"; };` +
  ` if [ -n "$ZSH_VERSION" ]; then precmd_functions+=(__dari_cwd); else PROMPT_COMMAND="__dari_cwd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; fi\r`

/** 숨김 대기 시간 (ms) */
export const QUIET_TIMEOUT = 2500

const quiet = new Set<string>()

export const isQuiet = (sessionId: string) => quiet.has(sessionId)
export const endQuiet = (sessionId: string) => quiet.delete(sessionId)

/** 입력 중이던 줄을 비우고(Ctrl+E, Ctrl+U) 훅을 넣는다 */
export function installCwdHook(sessionId: string) {
  quiet.add(sessionId)
  window.api.term.write(sessionId, '\x05\x15' + HOOK)
}
