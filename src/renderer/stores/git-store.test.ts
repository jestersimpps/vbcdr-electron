import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitStore } from './git-store'

interface GitApiMock {
  isRepo: ReturnType<typeof vi.fn>
  commits: ReturnType<typeof vi.fn>
  branches: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
  checkout: ReturnType<typeof vi.fn>
  conflicts: ReturnType<typeof vi.fn>
  pull: ReturnType<typeof vi.fn>
  rebaseRemote: ReturnType<typeof vi.fn>
  registerFetch: ReturnType<typeof vi.fn>
  onDrift: ReturnType<typeof vi.fn>
}

let lastDriftCb: ((projectId: string, drift: unknown) => void) | null = null
let unsubDrift: ReturnType<typeof vi.fn>

beforeEach(() => {
  unsubDrift = vi.fn()
  lastDriftCb = null
  const git: GitApiMock = {
    isRepo: vi.fn(async () => true),
    commits: vi.fn(async () => [{ hash: 'abc', shortHash: 'abc', message: 'm', author: 'a', date: 'd', refs: [], parents: [] }]),
    branches: vi.fn(async () => [{ name: 'main', current: true, remote: false }]),
    status: vi.fn(async () => ({ '/p/a.ts': 'modified' })),
    checkout: vi.fn(async () => ({ success: true, branch: 'main', stashed: false })),
    conflicts: vi.fn(async () => []),
    pull: vi.fn(async () => undefined),
    rebaseRemote: vi.fn(async () => undefined),
    registerFetch: vi.fn(),
    onDrift: vi.fn((cb: (projectId: string, drift: unknown) => void) => {
      lastDriftCb = cb
      return unsubDrift
    })
  }
  ;(window as unknown as { api: { git: GitApiMock } }).api = {
    ...(window as unknown as { api: Record<string, unknown> }).api,
    git
  } as never

  useGitStore.setState({
    commitsPerProject: {},
    branchesPerProject: {},
    isRepoPerProject: {},
    statusPerProject: {},
    switchingBranch: false,
    driftPerProject: {},
    driftDismissed: {},
    conflictsPerProject: {},
    conflictsDismissed: false as never
  })
})

const gitApi = (): GitApiMock =>
  (window as unknown as { api: { git: GitApiMock } }).api.git

describe('git-store', () => {
  describe('loadGitData', () => {
    it('marks the project non-repo and skips data fetches when not a repo', async () => {
      gitApi().isRepo.mockResolvedValueOnce(false)
      await useGitStore.getState().loadGitData('p1', '/p')
      const s = useGitStore.getState()
      expect(s.isRepoPerProject.p1).toBe(false)
      expect(s.commitsPerProject.p1).toBeUndefined()
      expect(gitApi().commits).not.toHaveBeenCalled()
      expect(gitApi().registerFetch).not.toHaveBeenCalled()
    })

    it('loads commits and branches in parallel and registers fetch when a repo', async () => {
      await useGitStore.getState().loadGitData('p1', '/p')
      const s = useGitStore.getState()
      expect(s.isRepoPerProject.p1).toBe(true)
      expect(s.commitsPerProject.p1).toHaveLength(1)
      expect(s.branchesPerProject.p1).toEqual([{ name: 'main', current: true, remote: false }])
      expect(gitApi().registerFetch).toHaveBeenCalledWith('p1', '/p')
    })
  })

  describe('loadStatus', () => {
    it('stores the status map and triggers conflict load when conflicts are present', async () => {
      gitApi().status.mockResolvedValueOnce({ '/p/a.ts': 'conflict', '/p/b.ts': 'modified' })
      gitApi().conflicts.mockResolvedValueOnce([{ path: '/p/a.ts', absolutePath: '/p/a.ts' }])

      await useGitStore.getState().loadStatus('p1', '/p')

      await vi.waitFor(() => {
        expect(useGitStore.getState().conflictsPerProject.p1).toEqual([{ path: '/p/a.ts', absolutePath: '/p/a.ts' }])
      })
      expect(useGitStore.getState().statusPerProject.p1).toEqual({ '/p/a.ts': 'conflict', '/p/b.ts': 'modified' })
    })

    it('does not call conflicts() when no conflicts exist', async () => {
      await useGitStore.getState().loadStatus('p1', '/p')
      expect(gitApi().conflicts).not.toHaveBeenCalled()
    })
  })

  describe('switchBranch', () => {
    it('sets the loading flag, reloads data on success, and clears the flag', async () => {
      const success = await useGitStore.getState().switchBranch('p1', '/p', 'feature')
      expect(success).toBe(true)
      expect(gitApi().checkout).toHaveBeenCalledWith('/p', 'feature')
      expect(gitApi().commits).toHaveBeenCalled()
      expect(gitApi().status).toHaveBeenCalled()
      expect(useGitStore.getState().switchingBranch).toBe(false)
    })

    it('clears the loading flag and skips reload when checkout fails', async () => {
      gitApi().checkout.mockResolvedValueOnce({ success: false, branch: 'feature', stashed: false, error: 'dirty' })
      const success = await useGitStore.getState().switchBranch('p1', '/p', 'feature')
      expect(success).toBe(false)
      expect(gitApi().commits).not.toHaveBeenCalled()
      expect(useGitStore.getState().switchingBranch).toBe(false)
    })

    it('clears the loading flag even when checkout throws', async () => {
      gitApi().checkout.mockRejectedValueOnce(new Error('boom'))
      await expect(useGitStore.getState().switchBranch('p1', '/p', 'feature')).rejects.toThrow('boom')
      expect(useGitStore.getState().switchingBranch).toBe(false)
    })
  })

  describe('drift', () => {
    it('setDrift stores info and resets the dismissed flag for the project', () => {
      useGitStore.setState({ driftDismissed: { p1: true } as never })
      useGitStore.getState().setDrift('p1', { ahead: 1, behind: 0, diverged: false, remoteBranch: 'origin/main' })
      const s = useGitStore.getState()
      expect(s.driftPerProject.p1).toEqual({ ahead: 1, behind: 0, diverged: false, remoteBranch: 'origin/main' })
      expect((s.driftDismissed as Record<string, boolean>).p1).toBe(false)
    })

    it('dismissDrift sets the per-project dismissed flag', () => {
      useGitStore.getState().dismissDrift('p1')
      expect((useGitStore.getState().driftDismissed as Record<string, boolean>).p1).toBe(true)
    })
  })

  describe('pull / rebaseRemote', () => {
    it('pull clears drift for the project and reloads data + status', async () => {
      useGitStore.setState({
        driftPerProject: { p1: { ahead: 0, behind: 2, diverged: false, remoteBranch: 'origin/main' } }
      })
      await useGitStore.getState().pull('p1', '/p')
      expect(gitApi().pull).toHaveBeenCalledWith('/p')
      expect(useGitStore.getState().driftPerProject.p1).toBeUndefined()
      expect(gitApi().commits).toHaveBeenCalled()
      expect(gitApi().status).toHaveBeenCalled()
    })

    it('rebaseRemote clears drift and reloads data + status', async () => {
      useGitStore.setState({
        driftPerProject: { p1: { ahead: 1, behind: 1, diverged: true, remoteBranch: 'origin/main' } }
      })
      await useGitStore.getState().rebaseRemote('p1', '/p')
      expect(gitApi().rebaseRemote).toHaveBeenCalledWith('/p')
      expect(useGitStore.getState().driftPerProject.p1).toBeUndefined()
    })
  })

  describe('initFetchListener', () => {
    it('subscribes to onDrift and forwards into setDrift', () => {
      const off = useGitStore.getState().initFetchListener()
      expect(gitApi().onDrift).toHaveBeenCalledTimes(1)
      expect(lastDriftCb).not.toBeNull()

      lastDriftCb!('p1', { ahead: 3, behind: 0, diverged: false, remoteBranch: 'origin/main' })
      expect(useGitStore.getState().driftPerProject.p1).toEqual({
        ahead: 3,
        behind: 0,
        diverged: false,
        remoteBranch: 'origin/main'
      })

      expect(off).toBe(unsubDrift)
    })
  })
})
