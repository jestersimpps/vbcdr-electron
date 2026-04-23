import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EditorPrefsState {
  minimapEnabled: boolean
  autosaveEnabled: boolean
  autosaveDelayMs: number
  setMinimapEnabled: (enabled: boolean) => void
  setAutosaveEnabled: (enabled: boolean) => void
  setAutosaveDelayMs: (ms: number) => void
}

export const DEFAULT_AUTOSAVE_DELAY_MS = 1000

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set) => ({
      minimapEnabled: true,
      autosaveEnabled: false,
      autosaveDelayMs: DEFAULT_AUTOSAVE_DELAY_MS,
      setMinimapEnabled: (enabled: boolean) => set({ minimapEnabled: enabled }),
      setAutosaveEnabled: (enabled: boolean) => set({ autosaveEnabled: enabled }),
      setAutosaveDelayMs: (ms: number) => {
        const safe = Number.isFinite(ms) && ms >= 250 ? Math.round(ms) : DEFAULT_AUTOSAVE_DELAY_MS
        set({ autosaveDelayMs: safe })
      }
    }),
    {
      name: 'vbcdr-editor-prefs',
      partialize: (state) => ({
        minimapEnabled: state.minimapEnabled,
        autosaveEnabled: state.autosaveEnabled,
        autosaveDelayMs: state.autosaveDelayMs
      })
    }
  )
)
