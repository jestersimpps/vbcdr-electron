import { create } from 'zustand'
import type { GhStatus, TrackedWorktree, WorktreeInfo } from '@/models/types'

interface WorktreeStore {
  worktreesPerProject: Record<string, TrackedWorktree[]>
  refreshingPerProject: Record<string, boolean>
  ghStatus: GhStatus | null
  load: (projectId: string) => Promise<void>
  refreshProject: (projectId: string) => Promise<void>
  refreshOne: (id: string) => Promise<TrackedWorktree | null>
  create: (projectId: string, projectPath: string) => Promise<TrackedWorktree>
  renameBranch: (id: string, newBranch: string) => Promise<string | null>
  setLabel: (id: string, label: string) => Promise<void>
  remove: (id: string) => Promise<string | null>
  loadGhStatus: () => Promise<GhStatus>
  find: (id: string) => TrackedWorktree | undefined
}

function replaceProjectList(
  state: WorktreeStore,
  projectId: string,
  worktrees: TrackedWorktree[]
): Pick<WorktreeStore, 'worktreesPerProject'> {
  return { worktreesPerProject: { ...state.worktreesPerProject, [projectId]: worktrees } }
}

function upsert(list: TrackedWorktree[], worktree: TrackedWorktree): TrackedWorktree[] {
  const index = list.findIndex((w) => w.id === worktree.id)
  if (index === -1) return [...list, worktree]
  const next = [...list]
  next[index] = worktree
  return next
}

export function toWorktreeInfo(worktree: TrackedWorktree): WorktreeInfo {
  return { id: worktree.id, path: worktree.path, branch: worktree.branch, projectPath: worktree.projectPath }
}

export async function createWorktreeForProject(projectId: string, projectPath: string): Promise<WorktreeInfo | null> {
  try {
    if (!(await window.api.git.isRepo(projectPath))) return null
    return toWorktreeInfo(await useWorktreeStore.getState().create(projectId, projectPath))
  } catch (err) {
    console.error('Failed to create worktree, falling back to project folder', err)
    return null
  }
}

export const useWorktreeStore = create<WorktreeStore>((set, get) => ({
  worktreesPerProject: {},
  refreshingPerProject: {},
  ghStatus: null,

  load: async (projectId: string) => {
    const worktrees = await window.api.worktrees.list(projectId)
    set((state) => replaceProjectList(state, projectId, worktrees))
  },

  refreshProject: async (projectId: string) => {
    if (get().refreshingPerProject[projectId]) return
    set((state) => ({ refreshingPerProject: { ...state.refreshingPerProject, [projectId]: true } }))
    try {
      const worktrees = await window.api.worktrees.refreshProject(projectId)
      set((state) => replaceProjectList(state, projectId, worktrees))
    } finally {
      set((state) => ({ refreshingPerProject: { ...state.refreshingPerProject, [projectId]: false } }))
    }
  },

  refreshOne: async (id: string) => {
    const existing = get().find(id)
    const refreshed = await window.api.worktrees.refresh(id)
    if (!existing) return refreshed
    set((state) => {
      const list = state.worktreesPerProject[existing.projectId] ?? []
      const next = refreshed ? upsert(list, refreshed) : list.filter((w) => w.id !== id)
      return replaceProjectList(state, existing.projectId, next)
    })
    return refreshed
  },

  create: async (projectId: string, projectPath: string) => {
    const worktree = await window.api.worktrees.create(projectId, projectPath)
    set((state) => replaceProjectList(state, projectId, upsert(state.worktreesPerProject[projectId] ?? [], worktree)))
    return worktree
  },

  renameBranch: async (id: string, newBranch: string) => {
    const result = await window.api.worktrees.renameBranch(id, newBranch)
    if (!result.ok) return result.error ?? 'Rename failed'
    const existing = get().find(id)
    if (existing) {
      set((state) =>
        replaceProjectList(
          state,
          existing.projectId,
          upsert(state.worktreesPerProject[existing.projectId] ?? [], { ...existing, branch: newBranch.trim() })
        )
      )
    }
    return null
  },

  setLabel: async (id: string, label: string) => {
    const updated = await window.api.worktrees.setLabel(id, label)
    if (!updated) return
    set((state) => replaceProjectList(state, updated.projectId, upsert(state.worktreesPerProject[updated.projectId] ?? [], updated)))
  },

  remove: async (id: string) => {
    const result = await window.api.worktrees.remove(id)
    if (!result.ok) return result.error ?? 'Remove failed'
    const existing = get().find(id)
    if (existing) {
      set((state) =>
        replaceProjectList(
          state,
          existing.projectId,
          (state.worktreesPerProject[existing.projectId] ?? []).filter((w) => w.id !== id)
        )
      )
    }
    return null
  },

  loadGhStatus: async () => {
    const ghStatus = await window.api.worktrees.ghStatus()
    set({ ghStatus })
    return ghStatus
  },

  find: (id: string) => {
    for (const list of Object.values(get().worktreesPerProject)) {
      const match = list.find((w) => w.id === id)
      if (match) return match
    }
    return undefined
  }
}))
