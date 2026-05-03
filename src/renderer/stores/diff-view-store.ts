import { create } from 'zustand'

export type DiffView =
  | { kind: 'working' }
  | { kind: 'commit'; hash: string; shortHash: string; message: string }

interface DiffViewStore {
  viewPerProject: Record<string, DiffView>
  showCommit: (projectId: string, hash: string, shortHash: string, message: string) => void
  showWorking: (projectId: string) => void
}

export const useDiffViewStore = create<DiffViewStore>((set) => ({
  viewPerProject: {},
  showCommit: (projectId, hash, shortHash, message) =>
    set((s) => ({
      viewPerProject: { ...s.viewPerProject, [projectId]: { kind: 'commit', hash, shortHash, message } }
    })),
  showWorking: (projectId) =>
    set((s) => ({
      viewPerProject: { ...s.viewPerProject, [projectId]: { kind: 'working' } }
    }))
}))
