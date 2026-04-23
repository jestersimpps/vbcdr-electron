import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EditorPrefsState {
  minimapEnabled: boolean
  autosaveEnabled: boolean
  autosaveDelayMs: number
  fontSize: number
  tabSize: number
  bracketPairColorization: boolean
  setMinimapEnabled: (enabled: boolean) => void
  setAutosaveEnabled: (enabled: boolean) => void
  setAutosaveDelayMs: (ms: number) => void
  setFontSize: (px: number) => void
  setTabSize: (n: number) => void
  setBracketPairColorization: (enabled: boolean) => void
}

export const DEFAULT_AUTOSAVE_DELAY_MS = 1000
export const DEFAULT_FONT_SIZE = 13
export const DEFAULT_TAB_SIZE = 2

function clampFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_FONT_SIZE
  return Math.max(8, Math.min(32, Math.round(px)))
}

function clampTabSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TAB_SIZE
  return Math.max(1, Math.min(8, Math.round(n)))
}

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set) => ({
      minimapEnabled: true,
      autosaveEnabled: false,
      autosaveDelayMs: DEFAULT_AUTOSAVE_DELAY_MS,
      fontSize: DEFAULT_FONT_SIZE,
      tabSize: DEFAULT_TAB_SIZE,
      bracketPairColorization: true,
      setMinimapEnabled: (enabled: boolean) => set({ minimapEnabled: enabled }),
      setAutosaveEnabled: (enabled: boolean) => set({ autosaveEnabled: enabled }),
      setAutosaveDelayMs: (ms: number) => {
        const safe = Number.isFinite(ms) && ms >= 250 ? Math.round(ms) : DEFAULT_AUTOSAVE_DELAY_MS
        set({ autosaveDelayMs: safe })
      },
      setFontSize: (px: number) => set({ fontSize: clampFontSize(px) }),
      setTabSize: (n: number) => set({ tabSize: clampTabSize(n) }),
      setBracketPairColorization: (enabled: boolean) => set({ bracketPairColorization: enabled })
    }),
    {
      name: 'vbcdr-editor-prefs',
      partialize: (state) => ({
        minimapEnabled: state.minimapEnabled,
        autosaveEnabled: state.autosaveEnabled,
        autosaveDelayMs: state.autosaveDelayMs,
        fontSize: state.fontSize,
        tabSize: state.tabSize,
        bracketPairColorization: state.bracketPairColorization
      })
    }
  )
)
