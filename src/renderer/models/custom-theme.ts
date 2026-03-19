import type { ITheme } from '@xterm/xterm'

export interface CustomThemeUI {
  bgPrimary: string
  bgSecondary: string
  bgElevated: string
  bgSubtle: string
  text1: string
  text2: string
  text3: string
  border1: string
  border2: string
}

export interface CustomThemeColors {
  ui: CustomThemeUI
  terminal: ITheme
}

export const DEFAULT_CUSTOM_DARK: CustomThemeColors = {
  ui: {
    bgPrimary: '#09090b',
    bgSecondary: '#161b22',
    bgElevated: '#21262d',
    bgSubtle: '#30363d',
    text1: '#e6edf3',
    text2: '#8b949e',
    text3: '#6e7681',
    border1: '#30363d',
    border2: '#484f58',
  },
  terminal: {
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
    brightWhite: '#ffffff',
  },
}

export const DEFAULT_CUSTOM_LIGHT: CustomThemeColors = {
  ui: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f6f8fa',
    bgElevated: '#eaeef2',
    bgSubtle: '#d0d8e0',
    text1: '#0d1117',
    text2: '#4a5460',
    text3: '#5a646e',
    border1: '#c8d0d8',
    border2: '#a8b4be',
  },
  terminal: {
    background: '#ffffff',
    foreground: '#1f231f',
    cursor: '#096fdb',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#241929',
    red: '#cf2330',
    green: '#116428',
    yellow: '#4d2d00',
    blue: '#096fdb',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7681',
    brightBlack: '#57606a',
    brightRed: '#a4423f',
    brightGreen: '#1a7f34',
    brightYellow: '#633d0f',
    brightBlue: '#21cbff',
    brightMagenta: '#a475f9',
    brightCyan: '#31aaa0',
    brightWhite: '#8d959e',
  },
}
