import { create } from 'zustand'
import type { OpenFile } from '@/models/types'

interface EditorStore {
  openFiles: OpenFile[]
  activeFilePath: string | null
  openFile: (path: string, name: string) => Promise<void>
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  openFiles: [],
  activeFilePath: null,

  openFile: async (path: string, name: string) => {
    const existing = get().openFiles.find((f) => f.path === path)
    if (existing) {
      set({ activeFilePath: path })
      return
    }
    const content = await window.api.fs.readFile(path)
    set((state) => ({
      openFiles: [...state.openFiles, { path, name, content }],
      activeFilePath: path
    }))
  },

  closeFile: (path: string) => {
    set((state) => {
      const next = state.openFiles.filter((f) => f.path !== path)
      let nextActive = state.activeFilePath
      if (state.activeFilePath === path) {
        const idx = state.openFiles.findIndex((f) => f.path === path)
        nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null
      }
      return { openFiles: next, activeFilePath: nextActive }
    })
  },

  setActiveFile: (path: string) => {
    set({ activeFilePath: path })
  }
}))
