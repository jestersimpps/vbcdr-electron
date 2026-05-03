import { create } from 'zustand'

export type DiffView =
  | { kind: 'working' }
  | { kind: 'commit'; hash: string; shortHash: string; message: string }
  | { kind: 'incoming'; from: string; to: string; count: number }
  | { kind: 'outgoing'; from: string; to: string; count: number }

interface DiffViewStore {
  viewPerProject: Record<string, DiffView>
  showCommit: (projectId: string, hash: string, shortHash: string, message: string) => void
  showWorking: (projectId: string) => void
  showIncoming: (projectId: string, from: string, to: string, count: number) => void
  showOutgoing: (projectId: string, from: string, to: string, count: number) => void
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
    })),
  showIncoming: (projectId, from, to, count) =>
    set((s) => ({
      viewPerProject: { ...s.viewPerProject, [projectId]: { kind: 'incoming', from, to, count } }
    })),
  showOutgoing: (projectId, from, to, count) =>
    set((s) => ({
      viewPerProject: { ...s.viewPerProject, [projectId]: { kind: 'outgoing', from, to, count } }
    }))
}))
