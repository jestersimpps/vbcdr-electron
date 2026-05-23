import { create } from 'zustand'
import type { GitCommit, GitBranch, GitFileStatus, BranchDriftInfo, ConflictInfo, GitOpResult } from '@/models/types'

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
  pullingPerProject: Record<string, boolean>
  rebasingPerProject: Record<string, boolean>
  lastGitErrorPerProject: Record<string, string>
  driftPerProject: Record<string, BranchDriftInfo>
  driftDismissed: Record<string, boolean>
  conflictsPerProject: Record<string, ConflictInfo[]>
  conflictsDismissedPerProject: Record<string, boolean>
  loadGitData: (projectId: string, cwd: string) => Promise<void>
  loadStatus: (projectId: string, cwd: string) => Promise<void>
  loadRangeFileCounts: (projectId: string, cwd: string) => Promise<void>
  switchBranch: (projectId: string, cwd: string, branchName: string) => Promise<boolean>
  setDrift: (projectId: string, drift: BranchDriftInfo) => void
  dismissDrift: (projectId: string) => void
  loadConflicts: (projectId: string, cwd: string) => Promise<void>
  dismissConflicts: (projectId: string) => void
  clearGitError: (projectId: string) => void
  pull: (projectId: string, cwd: string) => Promise<GitOpResult>
  push: (projectId: string, cwd: string) => Promise<GitOpResult>
  rebaseRemote: (projectId: string, cwd: string) => Promise<GitOpResult>
  initFetchListener: () => () => void
  removeProjectState: (projectId: string) => void
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
  pullingPerProject: {},
  rebasingPerProject: {},
  lastGitErrorPerProject: {},
  driftPerProject: {},
  driftDismissed: {},
  conflictsPerProject: {},
  conflictsDismissedPerProject: {},

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
      conflictsDismissedPerProject: {
        ...s.conflictsDismissedPerProject,
        [projectId]: conflicts.length === 0
      }
    }))
  },

  dismissConflicts: (projectId: string) => {
    set((s) => ({
      conflictsDismissedPerProject: { ...s.conflictsDismissedPerProject, [projectId]: true }
    }))
  },

  clearGitError: (projectId: string) => {
    set((s) => {
      const { [projectId]: _, ...rest } = s.lastGitErrorPerProject
      return { lastGitErrorPerProject: rest }
    })
  },

  pull: async (projectId: string, cwd: string) => {
    if (get().pullingPerProject[projectId]) return { ok: false, output: '', error: 'pull already in progress' }
    set((s) => ({
      pullingPerProject: { ...s.pullingPerProject, [projectId]: true },
      lastGitErrorPerProject: (() => {
        const { [projectId]: _, ...rest } = s.lastGitErrorPerProject
        return rest
      })()
    }))
    try {
      const result = await window.api.git.pull(cwd)
      if (!result.ok) {
        set((s) => ({
          lastGitErrorPerProject: { ...s.lastGitErrorPerProject, [projectId]: result.error ?? 'pull failed' }
        }))
      }
      await get().loadGitData(projectId, cwd)
      await get().loadStatus(projectId, cwd)
      const drift = await window.api.git.fetchNow(cwd)
      get().setDrift(projectId, drift)
      await get().loadRangeFileCounts(projectId, cwd)
      return result
    } finally {
      set((s) => {
        const { [projectId]: _, ...rest } = s.pullingPerProject
        return { pullingPerProject: rest }
      })
    }
  },

  push: async (projectId: string, cwd: string) => {
    if (get().pushingPerProject[projectId]) return { ok: false, output: '', error: 'push already in progress' }
    set((s) => ({
      pushingPerProject: { ...s.pushingPerProject, [projectId]: true },
      lastGitErrorPerProject: (() => {
        const { [projectId]: _, ...rest } = s.lastGitErrorPerProject
        return rest
      })()
    }))
    try {
      const result = await window.api.git.push(cwd)
      if (!result.ok) {
        set((s) => ({
          lastGitErrorPerProject: { ...s.lastGitErrorPerProject, [projectId]: result.error ?? 'push failed' }
        }))
      }
      await get().loadGitData(projectId, cwd)
      await get().loadStatus(projectId, cwd)
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
    if (get().rebasingPerProject[projectId]) return { ok: false, output: '', error: 'rebase already in progress' }
    set((s) => ({
      rebasingPerProject: { ...s.rebasingPerProject, [projectId]: true },
      lastGitErrorPerProject: (() => {
        const { [projectId]: _, ...rest } = s.lastGitErrorPerProject
        return rest
      })()
    }))
    try {
      const result = await window.api.git.rebaseRemote(cwd)
      if (!result.ok) {
        set((s) => ({
          lastGitErrorPerProject: { ...s.lastGitErrorPerProject, [projectId]: result.error ?? 'rebase failed' }
        }))
      }
      await get().loadGitData(projectId, cwd)
      await get().loadStatus(projectId, cwd)
      const drift = await window.api.git.fetchNow(cwd)
      get().setDrift(projectId, drift)
      await get().loadRangeFileCounts(projectId, cwd)
      return result
    } finally {
      set((s) => {
        const { [projectId]: _, ...rest } = s.rebasingPerProject
        return { rebasingPerProject: rest }
      })
    }
  },

  initFetchListener: () => {
    return window.api.git.onDrift((projectId: string, drift: unknown) => {
      get().setDrift(projectId, drift as BranchDriftInfo)
    })
  },

  removeProjectState: (projectId: string) => {
    set((s) => {
      const {
        commitsPerProject,
        branchesPerProject,
        isRepoPerProject,
        statusPerProject,
        commitFileCountsPerProject,
        rangeFileCountsPerProject,
        unpushedHashesPerProject,
        pushingPerProject,
        pullingPerProject,
        rebasingPerProject,
        lastGitErrorPerProject,
        driftPerProject,
        driftDismissed,
        conflictsPerProject,
        conflictsDismissedPerProject
      } = s
      const drop = <T,>(rec: Record<string, T>): Record<string, T> => {
        if (!(projectId in rec)) return rec
        const { [projectId]: _, ...rest } = rec
        return rest
      }
      return {
        commitsPerProject: drop(commitsPerProject),
        branchesPerProject: drop(branchesPerProject),
        isRepoPerProject: drop(isRepoPerProject),
        statusPerProject: drop(statusPerProject),
        commitFileCountsPerProject: drop(commitFileCountsPerProject),
        rangeFileCountsPerProject: drop(rangeFileCountsPerProject),
        unpushedHashesPerProject: drop(unpushedHashesPerProject),
        pushingPerProject: drop(pushingPerProject),
        pullingPerProject: drop(pullingPerProject),
        rebasingPerProject: drop(rebasingPerProject),
        lastGitErrorPerProject: drop(lastGitErrorPerProject),
        driftPerProject: drop(driftPerProject),
        driftDismissed: drop(driftDismissed),
        conflictsPerProject: drop(conflictsPerProject),
        conflictsDismissedPerProject: drop(conflictsDismissedPerProject)
      }
    })
  }
}))
