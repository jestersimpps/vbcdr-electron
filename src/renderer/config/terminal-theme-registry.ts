import type { ITheme } from '@xterm/xterm'

export const TERMINAL_THEMES: Record<string, ITheme> = {
  'github-dark': {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#264f78',
    black: '#161b22',
    red: '#ff7b72',
    green: '#7ee787',
    yellow: '#ffa657',
    blue: '#79c0ff',
    magenta: '#d2a8ff',
    cyan: '#a5d6ff',
    white: '#e6edf3',
    brightBlack: '#30363d',
    brightRed: '#ffa198',
    brightGreen: '#9be9a8',
    brightYellow: '#ffbe7c',
    brightBlue: '#a5d6ff',
    brightMagenta: '#dbb7ff',
    brightCyan: '#c9e0ff',
    brightWhite: '#ffffff'
  },

  'github-light': {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#1f2328',
    red: '#cf222e',
    green: '#116329',
    yellow: '#953800',
    blue: '#0550ae',
    magenta: '#8250df',
    cyan: '#0a3069',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#d1242f',
    brightGreen: '#1a7f37',
    brightYellow: '#9a6700',
    brightBlue: '#0969da',
    brightMagenta: '#8a63d2',
    brightCyan: '#1168cc',
    brightWhite: '#e6edf3'
  },

  'dracula-dark': {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  },

  'dracula-light': {
    background: '#f8f8f2',
    foreground: '#363c4a',
    cursor: '#363c4a',
    cursorAccent: '#f8f8f2',
    selectionBackground: '#d0d0c0',
    black: '#4d5566',
    red: '#d01a6f',
    green: '#009a5e',
    yellow: '#b8b700',
    blue: '#8739c7',
    magenta: '#d01a6f',
    cyan: '#00a0bf',
    white: '#7c8897',
    brightBlack: '#7c8897',
    brightRed: '#e02080',
    brightGreen: '#00b570',
    brightYellow: '#d0d000',
    brightBlue: '#9d4fe0',
    brightMagenta: '#e02090',
    brightCyan: '#00b8d8',
    brightWhite: '#a0a8b0'
  },

  'onedark-pro-dark': {
    background: '#21252b',
    foreground: '#abb2bf',
    cursor: '#528bff',
    cursorAccent: '#21252b',
    selectionBackground: '#3e4451',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff'
  },

  'onedark-pro-light': {
    background: '#fafafa',
    foreground: '#383a42',
    cursor: '#4078f2',
    cursorAccent: '#fafafa',
    selectionBackground: '#d0d0d0',
    black: '#383a42',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#a0a1a7',
    brightBlack: '#4f525e',
    brightRed: '#e45649',
    brightGreen: '#50a14f',
    brightYellow: '#c18401',
    brightBlue: '#4078f2',
    brightMagenta: '#a626a4',
    brightCyan: '#0184bc',
    brightWhite: '#fafafa'
  },

  'psychedelic-dark': {
    background: '#08060e',
    foreground: '#f0e0ff',
    cursor: '#ff2d95',
    cursorAccent: '#08060e',
    selectionBackground: '#bf5af244',
    black: '#1a1235',
    red: '#ff2d95',
    green: '#39ff14',
    yellow: '#ffff00',
    blue: '#00bbff',
    magenta: '#bf5af2',
    cyan: '#00ffff',
    white: '#f0e0ff',
    brightBlack: '#7858a8',
    brightRed: '#ff6eb4',
    brightGreen: '#7fff7f',
    brightYellow: '#ffff80',
    brightBlue: '#80ddff',
    brightMagenta: '#d88aff',
    brightCyan: '#80ffff',
    brightWhite: '#ffffff'
  },

  'psychedelic-light': {
    background: '#faf0ff',
    foreground: '#2a1040',
    cursor: '#d41876',
    cursorAccent: '#faf0ff',
    selectionBackground: '#bf5af240',
    black: '#2a1040',
    red: '#d41876',
    green: '#1a8a00',
    yellow: '#b5a000',
    blue: '#0066cc',
    magenta: '#8b2fc9',
    cyan: '#0088aa',
    white: '#7848a0',
    brightBlack: '#4a2868',
    brightRed: '#e02080',
    brightGreen: '#22a500',
    brightYellow: '#c8b200',
    brightBlue: '#0077dd',
    brightMagenta: '#a040e0',
    brightCyan: '#009dbb',
    brightWhite: '#faf0ff'
  }
}

// Add remaining themes using base templates
const darkTerminalBase = (bg: string, fg: string, cursor: string): ITheme => ({
  background: bg,
  foreground: fg,
  cursor: cursor,
  cursorAccent: bg,
  selectionBackground: `${fg}40`,
  black: '#1e1e1e',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#ffa657',
  blue: '#79c0ff',
  magenta: '#d2a8ff',
  cyan: '#a5d6ff',
  white: fg,
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#9be9a8',
  brightYellow: '#ffbe7c',
  brightBlue: '#a5d6ff',
  brightMagenta: '#dbb7ff',
  brightCyan: '#c9e0ff',
  brightWhite: '#ffffff'
})

const lightTerminalBase = (bg: string, fg: string, cursor: string): ITheme => ({
  background: bg,
  foreground: fg,
  cursor: cursor,
  cursorAccent: bg,
  selectionBackground: `${fg}40`,
  black: fg,
  red: '#cf222e',
  green: '#116329',
  yellow: '#953800',
  blue: '#0550ae',
  magenta: '#8250df',
  cyan: '#0a3069',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#d1242f',
  brightGreen: '#1a7f37',
  brightYellow: '#9a6700',
  brightBlue: '#0969da',
  brightMagenta: '#8a63d2',
  brightCyan: '#1168cc',
  brightWhite: bg
})

TERMINAL_THEMES['material-dark'] = darkTerminalBase('#1e1e1e', '#eeffff', '#82aaff')
TERMINAL_THEMES['material-light'] = lightTerminalBase('#fafafa', '#272727', '#5a5a5a')
TERMINAL_THEMES['nord-dark'] = darkTerminalBase('#2e3440', '#eceff4', '#88c0d0')
TERMINAL_THEMES['nord-light'] = lightTerminalBase('#eceff4', '#2e3440', '#5e81ac')
TERMINAL_THEMES['tokyo-night-dark'] = darkTerminalBase('#1a1b26', '#c0caf5', '#7aa2f7')
TERMINAL_THEMES['tokyo-night-light'] = lightTerminalBase('#d5d6db', '#343b58', '#2e7de9')
TERMINAL_THEMES['catppuccin-dark'] = darkTerminalBase('#1e1e2e', '#cdd6f4', '#89b4fa')
TERMINAL_THEMES['catppuccin-light'] = lightTerminalBase('#eff1f5', '#4c4f69', '#1e66f5')
TERMINAL_THEMES['pastel-dark'] = darkTerminalBase('#1e1e2e', '#e0d0f0', '#c8b8e0')
TERMINAL_THEMES['pastel-light'] = lightTerminalBase('#fffbf5', '#5c5470', '#7d728a')
TERMINAL_THEMES['gruvbox-dark'] = darkTerminalBase('#1d2021', '#ebdbb2', '#fabd2f')
TERMINAL_THEMES['gruvbox-light'] = lightTerminalBase('#fbf1c7', '#3c3836', '#af3a03')
TERMINAL_THEMES['monokai-dark'] = darkTerminalBase('#1e1f1c', '#f8f8f2', '#f8f8f0')
TERMINAL_THEMES['monokai-light'] = lightTerminalBase('#fafafa', '#272822', '#5f5a60')

export function getTerminalTheme(themeId: string): ITheme {
  return TERMINAL_THEMES[themeId] ?? TERMINAL_THEMES['github-dark']
}
