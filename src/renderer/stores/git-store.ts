import { create } from 'zustand'
import type { GitCommit, GitBranch, GitFileStatus, BranchDriftInfo, ConflictInfo } from '@/models/types'

interface GitStore {
  commitsPerProject: Record<string, GitCommit[]>
  branchesPerProject: Record<string, GitBranch[]>
  isRepoPerProject: Record<string, boolean>
  statusPerProject: Record<string, Record<string, GitFileStatus>>
  commitFileCountsPerProject: Record<string, Record<string, number>>
  rangeFileCountsPerProject: Record<string, { incoming: number; outgoing: number }>
  unpushedHashesPerProject: Record<string, Set<string>>
  switchingBranch: boolean
  pushingPerProject: Record<string, boolean>
  driftPerProject: Record<string, BranchDriftInfo>
  driftDismissed: Record<string, boolean>
  conflictsPerProject: Record<string, ConflictInfo[]>
  conflictsDismissed: boolean
  loadGitData: (projectId: string, cwd: string) => Promise<void>
  loadStatus: (projectId: string, cwd: string) => Promise<void>
  loadRangeFileCounts: (projectId: string, cwd: string) => Promise<void>
  switchBranch: (projectId: string, cwd: string, branchName: string) => Promise<boolean>
  setDrift: (projectId: string, drift: BranchDriftInfo) => void
  dismissDrift: (projectId: string) => void
  loadConflicts: (projectId: string, cwd: string) => Promise<void>
  dismissConflicts: () => void
  pull: (projectId: string, cwd: string) => Promise<void>
  push: (projectId: string, cwd: string) => Promise<string>
  rebaseRemote: (projectId: string, cwd: string) => Promise<void>
  initFetchListener: () => () => void
}

export const useGitStore = create<GitStore>((set, get) => ({
  commitsPerProject: {},
  branchesPerProject: {},
  isRepoPerProject: {},
  statusPerProject: {},
  commitFileCountsPerProject: {},
  rangeFileCountsPerProject: {},
  unpushedHashesPerProject: {},
  switchingBranch: false,
  pushingPerProject: {},
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

    if (commits.length > 0) {
      const hashes = commits.map((c: GitCommit) => c.hash)
      window.api.git.commitsFileCounts(cwd, hashes).then((counts) => {
        set((s) => ({
          commitFileCountsPerProject: { ...s.commitFileCountsPerProject, [projectId]: counts }
        }))
      })
    }

    void get().loadRangeFileCounts(projectId, cwd)
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

  loadRangeFileCounts: async (projectId: string, cwd: string) => {
    const drift = get().driftPerProject[projectId]
    if (!drift || !drift.remoteBranch || drift.diverged) {
      set((s) => {
        const { [projectId]: _, ...restCounts } = s.rangeFileCountsPerProject
        const { [projectId]: __, ...restHashes } = s.unpushedHashesPerProject
        return { rangeFileCountsPerProject: restCounts, unpushedHashesPerProject: restHashes }
      })
      return
    }
    const remote = drift.remoteBranch
    const [incoming, outgoing, unpushedList] = await Promise.all([
      drift.behind > 0 ? window.api.git.rangeFileCount(cwd, 'HEAD', remote) : Promise.resolve(0),
      drift.ahead > 0 ? window.api.git.rangeFileCount(cwd, remote, 'HEAD') : Promise.resolve(0),
      drift.ahead > 0 ? window.api.git.rangeHashes(cwd, remote, 'HEAD') : Promise.resolve([] as string[])
    ])
    set((s) => ({
      rangeFileCountsPerProject: {
        ...s.rangeFileCountsPerProject,
        [projectId]: { incoming, outgoing }
      },
      unpushedHashesPerProject: {
        ...s.unpushedHashesPerProject,
        [projectId]: new Set(unpushedList)
      }
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
    const drift = await window.api.git.fetchNow(cwd)
    get().setDrift(projectId, drift)
    await get().loadRangeFileCounts(projectId, cwd)
  },

  push: async (projectId: string, cwd: string) => {
    set((s) => ({ pushingPerProject: { ...s.pushingPerProject, [projectId]: true } }))
    try {
      const result = await window.api.git.push(cwd)
      set((s) => {
        const { [projectId]: _, ...rest } = s.driftPerProject
        return { driftPerProject: rest }
      })
      await get().loadGitData(projectId, cwd)
      const drift = await window.api.git.fetchNow(cwd)
      get().setDrift(projectId, drift)
      await get().loadRangeFileCounts(projectId, cwd)
      return result
    } finally {
      set((s) => {
        const { [projectId]: _, ...rest } = s.pushingPerProject
        return { pushingPerProject: rest }
      })
    }
  },

  rebaseRemote: async (projectId: string, cwd: string) => {
    await window.api.git.rebaseRemote(cwd)
    set((s) => {
      const { [projectId]: _, ...rest } = s.driftPerProject
      return { driftPerProject: rest }
    })
    await get().loadGitData(projectId, cwd)
    await get().loadStatus(projectId, cwd)
    const drift = await window.api.git.fetchNow(cwd)
    get().setDrift(projectId, drift)
    await get().loadRangeFileCounts(projectId, cwd)
  },

  initFetchListener: () => {
    return window.api.git.onDrift((projectId: string, drift: unknown) => {
      get().setDrift(projectId, drift as BranchDriftInfo)
    })
  }
}))
