import { create } from 'zustand'

interface DiffOverlayStore {
  changedFilesPerTab: Record<string, Set<string>>
  dismissedPerProject: Record<string, boolean>
  excludedPerProject: Record<string, Set<string>>
  markFileChanged: (tabId: string, path: string) => void
  clearForTab: (tabId: string) => void
  closeForProject: (projectId: string) => void
  resetDismiss: (projectId: string) => void
  toggleExcluded: (projectId: string, path: string) => void
  clearExcluded: (projectId: string) => void
}

export const useDiffOverlayStore = create<DiffOverlayStore>((set) => ({
  changedFilesPerTab: {},
  dismissedPerProject: {},
  excludedPerProject: {},

  toggleExcluded: (projectId: string, path: string) => {
    set((s) => {
      const existing = s.excludedPerProject[projectId] ?? new Set<string>()
      const next = new Set(existing)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { excludedPerProject: { ...s.excludedPerProject, [projectId]: next } }
    })
  },

  clearExcluded: (projectId: string) => {
    set((s) => {
      if (!s.excludedPerProject[projectId]) return s
      const next = { ...s.excludedPerProject }
      delete next[projectId]
      return { excludedPerProject: next }
    })
  },

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

  closeForProject: (projectId: string) => {
    set((s) => ({
      dismissedPerProject: { ...s.dismissedPerProject, [projectId]: true }
    }))
  },

  resetDismiss: (projectId: string) => {
    set((s) => {
      if (!s.dismissedPerProject[projectId]) return s
      const next = { ...s.dismissedPerProject }
      delete next[projectId]
      return { dismissedPerProject: next }
    })
  }
}))
