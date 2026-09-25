import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TerminalPrefsState {
  fontFamily: string
  fontSize: number
  setFontFamily: (family: string) => void
  setFontSize: (px: number) => void
}

export const DEFAULT_TERMINAL_FONT_FAMILY = 'Menlo, Monaco, Courier New, monospace'
export const DEFAULT_TERMINAL_FONT_SIZE = 13
export const MIN_TERMINAL_FONT_SIZE = 8
export const MAX_TERMINAL_FONT_SIZE = 32

export const TERMINAL_FONT_PRESETS: { label: string; value: string }[] = [
  { label: 'Menlo', value: DEFAULT_TERMINAL_FONT_FAMILY },
  { label: 'SF Mono', value: 'SF Mono, Menlo, monospace' },
  { label: 'Monaco', value: 'Monaco, Menlo, monospace' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, Menlo, monospace' },
  { label: 'Fira Code', value: 'Fira Code, Menlo, monospace' },
  { label: 'Cascadia Code', value: 'Cascadia Code, Menlo, monospace' },
  { label: 'Consolas', value: 'Consolas, Courier New, monospace' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Bedstead (teletext)', value: "'Bedstead', monospace" }
]

function clampFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TERMINAL_FONT_SIZE
  return Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, Math.round(px)))
}

export const useTerminalPrefsStore = create<TerminalPrefsState>()(
  persist(
    (set) => ({
      fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
      fontSize: DEFAULT_TERMINAL_FONT_SIZE,
      setFontFamily: (family: string) => set({ fontFamily: family.trim() || DEFAULT_TERMINAL_FONT_FAMILY }),
      setFontSize: (px: number) => set({ fontSize: clampFontSize(px) })
    }),
    {
      name: 'vbcdr-terminal-prefs',
      partialize: (state) => ({ fontFamily: state.fontFamily, fontSize: state.fontSize })
    }
  )
)
