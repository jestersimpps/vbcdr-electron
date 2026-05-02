import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockSend = vi.fn()
const mockGetAllWindows = vi.fn(() => [{ webContents: { send: mockSend } }])
const mockFetchRemote = vi.fn(async () => undefined)
const mockGetBranchDrift = vi.fn(async () => ({ ahead: 0, behind: 0, diverged: false, remoteBranch: 'origin/main' }))
const mockIsGitRepo = vi.fn(async () => true)

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mockGetAllWindows()
  }
}))

vi.mock('@main/services/git-service', () => ({
  fetchRemote: (cwd: string) => mockFetchRemote(cwd),
  getBranchDrift: (cwd: string) => mockGetBranchDrift(cwd),
  isGitRepo: (cwd: string) => mockIsGitRepo(cwd)
}))

async function importFresh(): Promise<typeof import('./git-fetch-service')> {
  vi.resetModules()
  return import('./git-fetch-service')
}

describe('git-fetch-service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSend.mockClear()
    mockFetchRemote.mockClear()
    mockGetBranchDrift.mockClear()
    mockIsGitRepo.mockReset()
    mockIsGitRepo.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('registerProject / tick', () => {
    it('runs an immediate fetch on register and starts the 60s interval', async () => {
      const mod = await importFresh()
      mod.registerProject('p1', '/p')

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledWith('/p'))
      expect(mockFetchRemote).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(60_000)
      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledTimes(2))
    })

    it('skips projects that are not git repos', async () => {
      mockIsGitRepo.mockResolvedValue(false)
      const mod = await importFresh()
      mod.registerProject('p1', '/p')

      await vi.waitFor(() => expect(mockIsGitRepo).toHaveBeenCalledWith('/p'))
      expect(mockFetchRemote).not.toHaveBeenCalled()
    })

    it('broadcasts when ahead, behind, or diverged', async () => {
      const mod = await importFresh()
      mod.registerProject('p1', '/p')

      await vi.waitFor(() => expect(mockGetBranchDrift).toHaveBeenCalledTimes(1))
      expect(mockSend).not.toHaveBeenCalled()

      mockGetBranchDrift.mockResolvedValueOnce({ ahead: 0, behind: 3, diverged: false, remoteBranch: 'origin/main' })
      vi.advanceTimersByTime(60_000)
      await vi.waitFor(() => expect(mockSend).toHaveBeenCalledWith('git:drift', 'p1', expect.objectContaining({ behind: 3 })))

      mockSend.mockClear()
      mockGetBranchDrift.mockResolvedValueOnce({ ahead: 5, behind: 0, diverged: false, remoteBranch: 'origin/main' })
      vi.advanceTimersByTime(60_000)
      await vi.waitFor(() => expect(mockSend).toHaveBeenCalledWith('git:drift', 'p1', expect.objectContaining({ ahead: 5 })))
    })

    it('swallows errors silently', async () => {
      mockIsGitRepo.mockRejectedValue(new Error('boom'))
      const mod = await importFresh()
      mod.registerProject('p1', '/p')

      await vi.waitFor(() => expect(mockIsGitRepo).toHaveBeenCalled())
      expect(mockFetchRemote).not.toHaveBeenCalled()
    })

    it('checks all registered projects on a single tick', async () => {
      const mod = await importFresh()
      mod.registerProject('p1', '/p1')
      mod.registerProject('p2', '/p2')

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledWith('/p1'))
      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledWith('/p2'))
      expect(mockFetchRemote).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(60_000)
      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledTimes(4))
    })
  })

  describe('unregisterProject', () => {
    it('removes the project so subsequent ticks skip it', async () => {
      const mod = await importFresh()
      mod.registerProject('p1', '/p1')
      mod.registerProject('p2', '/p2')

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledWith('/p1'))
      mockFetchRemote.mockClear()

      mod.unregisterProject('p1')
      vi.advanceTimersByTime(60_000)
      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalledWith('/p2'))
      expect(mockFetchRemote).not.toHaveBeenCalledWith('/p1')
    })

    it('clears the interval when the last project is removed', async () => {
      const mod = await importFresh()
      mod.registerProject('p1', '/p')
      mod.unregisterProject('p1')

      vi.advanceTimersByTime(60_000)
      expect(mockFetchRemote).not.toHaveBeenCalled()
    })
  })

  describe('stopAutoFetch', () => {
    it('clears the interval and forgets all projects', async () => {
      const mod = await importFresh()
      mod.registerProject('p1', '/p1')
      mod.registerProject('p2', '/p2')
      mod.stopAutoFetch()

      vi.advanceTimersByTime(60_000)
      expect(mockFetchRemote).not.toHaveBeenCalled()
    })
  })

  describe('fetchNow', () => {
    it('fetches and returns the current drift', async () => {
      mockGetBranchDrift.mockResolvedValueOnce({ ahead: 1, behind: 2, diverged: true, remoteBranch: 'origin/main' })
      const mod = await importFresh()
      const drift = await mod.fetchNow('/p')
      expect(mockFetchRemote).toHaveBeenCalledWith('/p')
      expect(drift).toEqual({ ahead: 1, behind: 2, diverged: true, remoteBranch: 'origin/main' })
    })
  })
})
