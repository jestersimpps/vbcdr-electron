import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EditorPrefsState {
  minimapEnabled: boolean
  setMinimapEnabled: (enabled: boolean) => void
}

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set) => ({
      minimapEnabled: true,
      setMinimapEnabled: (enabled: boolean) => set({ minimapEnabled: enabled })
    }),
    {
      name: 'vbcdr-editor-prefs',
      partialize: (state) => ({
        minimapEnabled: state.minimapEnabled
      })
    }
  )
)
