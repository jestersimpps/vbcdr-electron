import { create } from 'zustand'

interface DiffOverlayStore {
  changedFilesPerTab: Record<string, Set<string>>
  pendingPerProject: Record<string, string[]>
  openPerProject: Record<string, boolean>
  markFileChanged: (tabId: string, path: string) => void
  clearForTab: (tabId: string) => void
  openForProject: (projectId: string, paths: string[]) => void
  closeForProject: (projectId: string) => void
  removePath: (projectId: string, path: string) => void
}

export const useDiffOverlayStore = create<DiffOverlayStore>((set) => ({
  changedFilesPerTab: {},
  pendingPerProject: {},
  openPerProject: {},

  markFileChanged: (tabId: string, path: string) => {
    set((s) => {
      const existing = s.changedFilesPerTab[tabId] ?? new Set<string>()
      if (existing.has(path)) return s
      const next = new Set(existing)
      next.add(path)
      return { changedFilesPerTab: { ...s.changedFilesPerTab, [tabId]: next } }
    })
  },

  clearForTab: (tabId: string) => {
    set((s) => {
      if (!s.changedFilesPerTab[tabId]) return s
      const next = { ...s.changedFilesPerTab }
      delete next[tabId]
      return { changedFilesPerTab: next }
    })
  },

  openForProject: (projectId: string, paths: string[]) => {
    set((s) => ({
      pendingPerProject: { ...s.pendingPerProject, [projectId]: paths },
      openPerProject: { ...s.openPerProject, [projectId]: true }
    }))
  },

  closeForProject: (projectId: string) => {
    set((s) => ({
      openPerProject: { ...s.openPerProject, [projectId]: false }
    }))
  },

  removePath: (projectId: string, path: string) => {
    set((s) => {
      const current = s.pendingPerProject[projectId] ?? []
      const next = current.filter((p) => p !== path)
      return {
        pendingPerProject: { ...s.pendingPerProject, [projectId]: next },
        openPerProject: next.length === 0 ? { ...s.openPerProject, [projectId]: false } : s.openPerProject
      }
    })
  }
}))
