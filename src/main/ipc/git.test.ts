import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const svc = {
  isGitRepo: vi.fn(async () => true),
  getCommits: vi.fn(async () => []),
  getBranches: vi.fn(async () => []),
  getStatus: vi.fn(async () => ({})),
  getFileAtHead: vi.fn(async () => null),
  checkoutBranch: vi.fn(async () => ({ success: true, branch: 'main', stashed: false })),
  getDefaultBranch: vi.fn(async () => 'main'),
  getDiffSummary: vi.fn(async () => 'summary'),
  getConflicts: vi.fn(async () => []),
  pull: vi.fn(async () => 'pulled'),
  rebaseRemote: vi.fn(async () => 'rebased'),
  commitAll: vi.fn(async () => ({ success: true })),
  commitPaths: vi.fn(async () => ({ success: true })),
  getFirstChangedLine: vi.fn(async () => null),
  getCommitsSince: vi.fn(async () => []),
  getUserEmail: vi.fn(async () => 'me@x.com'),
  getLanguageTally: vi.fn(async () => ({})),
  addToGitignore: vi.fn(async () => ({ success: true })),
  listGitignore: vi.fn(async () => []),
  removeFromGitignore: vi.fn(async () => ({ success: true }))
}

vi.mock('@main/services/git-service', () => svc)

const registerProject = vi.fn()
const unregisterProject = vi.fn()
const fetchNow = vi.fn(async () => ({ ahead: 0, behind: 0, diverged: false, remoteBranch: null }))

vi.mock('@main/services/git-fetch-service', () => ({
  registerProject: (...args: unknown[]) => registerProject(...args),
  unregisterProject: (...args: unknown[]) => unregisterProject(...args),
  fetchNow: (...args: unknown[]) => fetchNow(...args)
}))

let registry: IpcRegistry

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({ ipcMain: makeIpcMainMock(registry) }))
  for (const fn of Object.values(svc)) (fn as ReturnType<typeof vi.fn>).mockClear()
  registerProject.mockClear()
  unregisterProject.mockClear()
  fetchNow.mockClear()

  const { registerGitHandlers } = await import('./git')
  registerGitHandlers()
})

describe('git ipc', () => {
  const cases: Array<[string, string, unknown[], () => unknown]> = [
    ['git:is-repo', 'isGitRepo', ['/p'], () => svc.isGitRepo],
    ['git:commits', 'getCommits', ['/p', 50], () => svc.getCommits],
    ['git:branches', 'getBranches', ['/p'], () => svc.getBranches],
    ['git:status', 'getStatus', ['/p'], () => svc.getStatus],
    ['git:file-at-head', 'getFileAtHead', ['/p', '/p/a.ts'], () => svc.getFileAtHead],
    ['git:checkout', 'checkoutBranch', ['/p', 'feature'], () => svc.checkoutBranch],
    ['git:default-branch', 'getDefaultBranch', ['/p'], () => svc.getDefaultBranch],
    ['git:diff-summary', 'getDiffSummary', ['/p', 'main'], () => svc.getDiffSummary],
    ['git:fetch-now', 'fetchNow', ['/p'], () => fetchNow],
    ['git:pull', 'pull', ['/p'], () => svc.pull],
    ['git:rebase-remote', 'rebaseRemote', ['/p'], () => svc.rebaseRemote],
    ['git:commit-all', 'commitAll', ['/p', 'msg'], () => svc.commitAll],
    ['git:commit-paths', 'commitPaths', ['/p', 'msg', ['/p/a.ts']], () => svc.commitPaths],
    ['git:first-changed-line', 'getFirstChangedLine', ['/p', '/p/a.ts'], () => svc.getFirstChangedLine],
    ['git:conflicts', 'getConflicts', ['/p'], () => svc.getConflicts],
    ['git:commits-since', 'getCommitsSince', ['/p', '2026-01-01'], () => svc.getCommitsSince],
    ['git:user-email', 'getUserEmail', ['/p'], () => svc.getUserEmail],
    ['git:language-tally', 'getLanguageTally', ['/p'], () => svc.getLanguageTally],
    ['git:ignore-path', 'addToGitignore', ['/p', '/p/x.ts'], () => svc.addToGitignore],
    ['git:gitignore-list', 'listGitignore', ['/p'], () => svc.listGitignore],
    ['git:gitignore-remove', 'removeFromGitignore', ['/p', 'pattern'], () => svc.removeFromGitignore]
  ]

  for (const [channel, _serviceName, args, getter] of cases) {
    it(`${channel} forwards to the right service function`, async () => {
      await invoke(registry, channel, ...args)
      expect(getter()).toHaveBeenCalledWith(...args)
    })
  }

  it('git:register-fetch and git:unregister-fetch forward to the fetch service', async () => {
    await invoke(registry, 'git:register-fetch', 'p1', '/p')
    expect(registerProject).toHaveBeenCalledWith('p1', '/p')

    await invoke(registry, 'git:unregister-fetch', 'p1')
    expect(unregisterProject).toHaveBeenCalledWith('p1')
  })
})
