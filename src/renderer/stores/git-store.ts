import { create } from 'zustand'
import type { GitCommit, GitBranch, GitFileStatus, BranchDriftInfo, ConflictInfo } from '@/models/types'

interface GitStore {
  commitsPerProject: Record<string, GitCommit[]>
  branchesPerProject: Record<string, GitBranch[]>
  isRepoPerProject: Record<string, boolean>
  statusPerProject: Record<string, Record<string, GitFileStatus>>
  switchingBranch: boolean
  driftPerProject: Record<string, BranchDriftInfo>
  driftDismissed: Record<string, boolean>
  conflictsPerProject: Record<string, ConflictInfo[]>
  conflictsDismissed: Record<string, boolean>
  loadGitData: (projectId: string, cwd: string) => Promise<void>
  loadStatus: (projectId: string, cwd: string) => Promise<void>
  switchBranch: (projectId: string, cwd: string, branchName: string) => Promise<boolean>
  setDrift: (projectId: string, drift: BranchDriftInfo) => void
  dismissDrift: (projectId: string) => void
  loadConflicts: (projectId: string, cwd: string) => Promise<void>
  dismissConflicts: () => void
  pull: (projectId: string, cwd: string) => Promise<void>
  rebaseRemote: (projectId: string, cwd: string) => Promise<void>
  initFetchListener: () => () => void
}

export const useGitStore = create<GitStore>((set, get) => ({
  commitsPerProject: {},
  branchesPerProject: {},
  isRepoPerProject: {},
  statusPerProject: {},
  switchingBranch: false,
  driftPerProject: {},
  driftDismissed: {},
  conflictsPerProject: {},
  conflictsDismissed: false,

  loadGitData: async (projectId: string, cwd: string) => {
    const isRepo = await window.api.git.isRepo(cwd)
    if (!isRepo) {
      set((s) => ({ isRepoPerProject: { ...s.isRepoPerProject, [projectId]: false } }))
      return
    }

    const [commits, branches] = await Promise.all([
      window.api.git.commits(cwd),
      window.api.git.branches(cwd)
    ])

    set((s) => ({
      isRepoPerProject: { ...s.isRepoPerProject, [projectId]: true },
      commitsPerProject: { ...s.commitsPerProject, [projectId]: commits },
      branchesPerProject: { ...s.branchesPerProject, [projectId]: branches }
    }))

    window.api.git.registerFetch(projectId, cwd)
  },

  loadStatus: async (projectId: string, cwd: string) => {
    const status = await window.api.git.status(cwd)
    set((s) => ({
      statusPerProject: { ...s.statusPerProject, [projectId]: status }
    }))

    const hasConflicts = Object.values(status).some((s) => s === 'conflict')
    if (hasConflicts) {
      get().loadConflicts(projectId, cwd)
    }
  },

  switchBranch: async (projectId: string, cwd: string, branchName: string) => {
    set({ switchingBranch: true })
    try {
      const result = await window.api.git.checkout(cwd, branchName)
      if (result.success) {
        await get().loadGitData(projectId, cwd)
        await get().loadStatus(projectId, cwd)
      }
      return result.success
    } finally {
      set({ switchingBranch: false })
    }
  },

  setDrift: (projectId: string, drift: BranchDriftInfo) => {
    set((s) => ({
      driftPerProject: { ...s.driftPerProject, [projectId]: drift },
      driftDismissed: { ...s.driftDismissed, [projectId]: false }
    }))
  },

  dismissDrift: (projectId: string) => {
    set((s) => ({
      driftDismissed: { ...s.driftDismissed, [projectId]: true }
    }))
  },

  loadConflicts: async (projectId: string, cwd: string) => {
    const conflicts = await window.api.git.conflicts(cwd)
    set((s) => ({
      conflictsPerProject: { ...s.conflictsPerProject, [projectId]: conflicts },
      conflictsDismissed: conflicts.length === 0
    }))
  },

  dismissConflicts: () => {
    set({ conflictsDismissed: true })
  },

  pull: async (projectId: string, cwd: string) => {
    await window.api.git.pull(cwd)
    set((s) => {
      const { [projectId]: _, ...rest } = s.driftPerProject
      return { driftPerProject: rest }
    })
    await get().loadGitData(projectId, cwd)
    await get().loadStatus(projectId, cwd)
  },

  rebaseRemote: async (projectId: string, cwd: string) => {
    await window.api.git.rebaseRemote(cwd)
    set((s) => {
      const { [projectId]: _, ...rest } = s.driftPerProject
      return { driftPerProject: rest }
    })
    await get().loadGitData(projectId, cwd)
    await get().loadStatus(projectId, cwd)
  },

  initFetchListener: () => {
    return window.api.git.onDrift((projectId: string, drift: unknown) => {
      get().setDrift(projectId, drift as BranchDriftInfo)
    })
  }
}))
