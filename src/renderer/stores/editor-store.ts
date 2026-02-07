import { create } from 'zustand'
import type { OpenFile } from '@/models/types'

interface ProjectEditorState {
  openFiles: OpenFile[]
  activeFilePath: string | null
}

interface EditorStore {
  statePerProject: Record<string, ProjectEditorState>
  openFile: (projectId: string, path: string, name: string) => Promise<void>
  closeFile: (projectId: string, path: string) => void
  setActiveFile: (projectId: string, path: string) => void
}

const EMPTY_STATE: ProjectEditorState = { openFiles: [], activeFilePath: null }

export const useEditorStore = create<EditorStore>((set, get) => ({
  statePerProject: {},

  openFile: async (projectId: string, path: string, name: string) => {
    const state = get().statePerProject[projectId] ?? EMPTY_STATE
    const existing = state.openFiles.find((f) => f.path === path)
    if (existing) {
      set((s) => ({
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { ...state, activeFilePath: path }
        }
      }))
      return
    }
    const content = await window.api.fs.readFile(path)
    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: {
            openFiles: [...prev.openFiles, { path, name, content }],
            activeFilePath: path
          }
        }
      }
    })
  },

  closeFile: (projectId: string, path: string) => {
    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      const next = prev.openFiles.filter((f) => f.path !== path)
      let nextActive = prev.activeFilePath
      if (prev.activeFilePath === path) {
        const idx = prev.openFiles.findIndex((f) => f.path === path)
        nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null
      }
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { openFiles: next, activeFilePath: nextActive }
        }
      }
    })
  },

  setActiveFile: (projectId: string, path: string) => {
    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { ...prev, activeFilePath: path }
        }
      }
    })
  }
}))
