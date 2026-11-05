import type { ITheme } from '@xterm/xterm'

export interface TerminalTheme {
  name: string
  /** 이 테마와 어울리는 앱 화면 밝기 (앱 테마가 '시스템'이 아닐 때 참고용) */
  dark: boolean
  colors: ITheme
}

/** 널리 쓰이는 공개 색 구성표 */
export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    name: 'Dari Dark',
    dark: true,
    colors: {
      background: '#1e1f22', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: '#3b82f655',
      black: '#1e1f22', red: '#f14c4c', green: '#23d18b', yellow: '#e5e510', blue: '#3b8eea', magenta: '#d670d6', cyan: '#29b8db', white: '#e5e5e5',
      brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#ffffff'
    }
  },
  {
    name: 'One Dark',
    dark: true,
    colors: {
      background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4451',
      black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff'
    }
  },
  {
    name: 'Dracula',
    dark: true,
    colors: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
    }
  },
  {
    name: 'Monokai',
    dark: true,
    colors: {
      background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', selectionBackground: '#49483e',
      black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75', blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
      brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
    }
  },
  {
    name: 'Solarized Dark',
    dark: true,
    colors: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    }
  },
  {
    name: 'Nord',
    dark: true,
    colors: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4'
    }
  },
  {
    name: 'Campbell (Windows Terminal)',
    dark: true,
    colors: {
      background: '#0c0c0c', foreground: '#cccccc', cursor: '#ffffff', selectionBackground: '#ffffff40',
      black: '#0c0c0c', red: '#c50f1f', green: '#13a10e', yellow: '#c19c00', blue: '#0037da', magenta: '#881798', cyan: '#3a96dd', white: '#cccccc',
      brightBlack: '#767676', brightRed: '#e74856', brightGreen: '#16c60c', brightYellow: '#f9f1a5', brightBlue: '#3b78ff', brightMagenta: '#b4009e', brightCyan: '#61d6d6', brightWhite: '#f2f2f2'
    }
  },
  {
    name: 'Tokyo Night',
    dark: true,
    colors: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5'
    }
  },
  {
    name: 'Catppuccin Mocha',
    dark: true,
    colors: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#585b70',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8'
    }
  },
  {
    name: 'Gruvbox Dark',
    dark: true,
    colors: {
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
    }
  },
  {
    name: 'Tomorrow Night',
    dark: true,
    colors: {
      background: '#1d1f21', foreground: '#c5c8c6', cursor: '#c5c8c6', selectionBackground: '#373b41',
      black: '#1d1f21', red: '#cc6666', green: '#b5bd68', yellow: '#f0c674', blue: '#81a2be', magenta: '#b294bb', cyan: '#8abeb7', white: '#c5c8c6',
      brightBlack: '#969896', brightRed: '#cc6666', brightGreen: '#b5bd68', brightYellow: '#f0c674', brightBlue: '#81a2be', brightMagenta: '#b294bb', brightCyan: '#8abeb7', brightWhite: '#ffffff'
    }
  },
  {
    name: 'Night Owl',
    dark: true,
    colors: {
      background: '#011627', foreground: '#d6deeb', cursor: '#80a4c2', selectionBackground: '#1d3b53',
      black: '#011627', red: '#ef5350', green: '#22da6e', yellow: '#addb67', blue: '#82aaff', magenta: '#c792ea', cyan: '#21c7a8', white: '#ffffff',
      brightBlack: '#575656', brightRed: '#ef5350', brightGreen: '#22da6e', brightYellow: '#ffeb95', brightBlue: '#82aaff', brightMagenta: '#c792ea', brightCyan: '#7fdbca', brightWhite: '#ffffff'
    }
  },
  {
    name: 'One Light',
    dark: false,
    colors: {
      background: '#fafafa', foreground: '#383a42', cursor: '#526eff', selectionBackground: '#e5e5e6',
      black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401', blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#a0a1a7',
      brightBlack: '#4f525e', brightRed: '#e45649', brightGreen: '#50a14f', brightYellow: '#c18401', brightBlue: '#4078f2', brightMagenta: '#a626a4', brightCyan: '#0184bc', brightWhite: '#ffffff'
    }
  },
  {
    name: 'Catppuccin Latte',
    dark: false,
    colors: {
      background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', selectionBackground: '#acb0be',
      black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d', blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
      brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc'
    }
  },
  {
    name: 'Gruvbox Light',
    dark: false,
    colors: {
      background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', selectionBackground: '#d5c4a1',
      black: '#fbf1c7', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#7c6f64',
      brightBlack: '#928374', brightRed: '#9d0006', brightGreen: '#79740e', brightYellow: '#b57614', brightBlue: '#076678', brightMagenta: '#8f3f71', brightCyan: '#427b58', brightWhite: '#3c3836'
    }
  },
  {
    name: 'Solarized Light',
    dark: false,
    colors: {
      background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', selectionBackground: '#eee8d5',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    }
  },
  {
    name: 'GitHub Light',
    dark: false,
    colors: {
      background: '#ffffff', foreground: '#24292f', cursor: '#0969da', selectionBackground: '#0969da33',
      black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
      brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f'
    }
  }
]

/** 예전 이름으로 저장된 설정도 찾을 수 있게 */
const RENAMED: Record<string, string> = { 'AwsTerm Dark': 'Dari Dark' }

export function findTheme(name: string): TerminalTheme {
  const n = RENAMED[name] ?? name
  return TERMINAL_THEMES.find((t) => t.name === n) ?? TERMINAL_THEMES[0]
}

/** 고르기 쉽게 보여줄 고정폭 글꼴 후보 (설치된 것만 실제로 적용됨) */
export const FONT_CANDIDATES = [
  'Consolas',
  'Cascadia Code',
  'Cascadia Mono',
  'D2Coding',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'NanumGothicCoding',
  'Menlo',
  'Monaco',
  'SF Mono'
]

/** 지정한 글꼴이 없을 때를 대비한 대체 글꼴 (한글 포함) */
export const fontStack = (family: string) =>
  `"${family}", D2Coding, Consolas, Menlo, "Malgun Gothic", "Apple SD Gothic Neo", monospace`
