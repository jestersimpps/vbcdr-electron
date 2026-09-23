import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrInfo, TrackedWorktree } from '@main/models/types'

class FakeStore {
  private state: { worktrees: TrackedWorktree[] }
  constructor(opts: { defaults: { worktrees: TrackedWorktree[] } }) {
    this.state = { worktrees: [...opts.defaults.worktrees] }
  }
  get(_key: 'worktrees'): TrackedWorktree[] {
    return this.state.worktrees
  }
  set(_key: 'worktrees', value: TrackedWorktree[]): void {
    this.state.worktrees = value
  }
}

vi.mock('electron-store', () => ({ default: FakeStore }))

const git = {
  createWorktree: vi.fn(async () => ({ path: '/p/.worktrees/llm/x', branch: 'llm/x' })),
  renameBranch: vi.fn(async () => ({ ok: true, output: '' })),
  getWorktreeState: vi.fn(async () => ({ exists: true, hasChanges: false, conflictPaths: [] as string[] })),
  removeWorktree: vi.fn(async () => ({ ok: true, output: '' })),
  syncDefaultBranch: vi.fn(async () => ({ ref: 'main', syncError: null as string | null })),
  commitWorktreeWork: vi.fn(async () => ({ ok: true, output: 'abc123' })),
  pointBranchAt: vi.fn(async () => ({ ok: true, output: 'llm/x' }))
}
vi.mock('@main/services/git-service', () => git)

const gh = { getPrForBranch: vi.fn(async (): Promise<PrInfo> => ({ url: null, state: 'none' })) }
vi.mock('@main/services/gh-service', () => gh)

let mod: typeof import('./worktree-service')

beforeEach(async () => {
  vi.resetModules()
  for (const fn of [...Object.values(git), ...Object.values(gh)]) (fn as ReturnType<typeof vi.fn>).mockClear()
  git.getWorktreeState.mockResolvedValue({ exists: true, hasChanges: false, conflictPaths: [] })
  gh.getPrForBranch.mockResolvedValue({ url: null, state: 'none' })
  mod = await import('./worktree-service')
})

describe('worktree-service', () => {
  it('creates and tracks a worktree scoped to its project', async () => {
    const created = await mod.createTrackedWorktree('p1', '/p')
    expect(git.createWorktree).toHaveBeenCalledWith('/p', undefined, undefined)
    expect(git.syncDefaultBranch).not.toHaveBeenCalled()
    expect(created).toMatchObject({ projectId: 'p1', projectPath: '/p', path: '/p/.worktrees/llm/x', branch: 'llm/x', prState: 'none' })
    expect(mod.listWorktrees('p1')).toHaveLength(1)
    expect(mod.listWorktrees('other')).toHaveLength(0)
  })

  it('renames the branch through git and records the new name', async () => {
    const { id } = await mod.createTrackedWorktree('p1', '/p')
    expect(await mod.renameTrackedBranch(id, ' feature/y ')).toEqual({ ok: true, output: '' })
    expect(git.renameBranch).toHaveBeenCalledWith('/p/.worktrees/llm/x', 'llm/x', 'feature/y')
    expect(mod.getWorktree(id)?.branch).toBe('feature/y')
  })

  it('rename is a no-op for the same name and rejects empty names', async () => {
    const { id } = await mod.createTrackedWorktree('p1', '/p')
    expect((await mod.renameTrackedBranch(id, 'llm/x')).ok).toBe(true)
    expect((await mod.renameTrackedBranch(id, '   ')).ok).toBe(false)
    expect(git.renameBranch).not.toHaveBeenCalled()
  })

  it('setWorktreeLabel stores a trimmed label and clears on blank', async () => {
    const { id } = await mod.createTrackedWorktree('p1', '/p')
    expect(mod.setWorktreeLabel(id, '  Fix login  ')?.label).toBe('Fix login')
    expect(mod.setWorktreeLabel(id, '   ')?.label).toBeNull()
    expect(mod.setWorktreeLabel('nope', 'x')).toBeNull()
  })

  it('refresh records PR state and conflicts', async () => {
    const { id } = await mod.createTrackedWorktree('p1', '/p')
    git.getWorktreeState.mockResolvedValue({ exists: true, hasChanges: true, conflictPaths: ['a.ts'] })
    gh.getPrForBranch.mockResolvedValue({ url: 'https://x/pr/1', state: 'open' })
    const refreshed = await mod.refreshWorktree(id)
    expect(refreshed).toMatchObject({ hasChanges: true, conflictPaths: ['a.ts'], prUrl: 'https://x/pr/1', prState: 'open' })
    expect(refreshed?.lastCheckedAt).toBeTypeOf('number')
  })

  it('refresh keeps the last known PR when gh answers unknown', async () => {
    const { id } = await mod.createTrackedWorktree('p1', '/p')
    gh.getPrForBranch.mockResolvedValue({ url: 'https://x/pr/1', state: 'open' })
    await mod.refreshWorktree(id)
    gh.getPrForBranch.mockResolvedValue({ url: null, state: 'unknown' })
    const refreshed = await mod.refreshWorktree(id)
    expect(refreshed).toMatchObject({ prUrl: 'https://x/pr/1', prState: 'open' })
  })

  it('refresh untracks a worktree whose folder disappeared', async () => {
    const { id } = await mod.createTrackedWorktree('p1', '/p')
    git.getWorktreeState.mockResolvedValue({ exists: false, hasChanges: false, conflictPaths: [] })
    expect(await mod.refreshWorktree(id)).toBeNull()
    expect(mod.listWorktrees('p1')).toHaveLength(0)
  })

  it('remove deletes the folder and branch and untracks the worktree', async () => {
    const a = await mod.createTrackedWorktree('p1', '/p')
    expect(await mod.removeTrackedWorktree(a.id)).toEqual({ ok: true, output: '' })
    expect(git.removeWorktree).toHaveBeenLastCalledWith('/p', '/p/.worktrees/llm/x', 'llm/x', true)
    expect(mod.listWorktrees('p1')).toHaveLength(0)
  })

  it('a worktree asked to start from the latest default branch syncs first and is cut from that ref', async () => {
    git.syncDefaultBranch.mockResolvedValueOnce({ ref: 'main', syncError: 'offline' })
    const created = await mod.createTrackedWorktree('p1', '/p', { fromLatestDefault: true })
    expect(git.syncDefaultBranch).toHaveBeenCalledWith('/p')
    expect(git.createWorktree).toHaveBeenCalledWith('/p', undefined, 'main')
    expect(created.base).toEqual({ ref: 'main', syncError: 'offline' })
  })

  it('finish commits leftover work, removes the folder, keeps the branch and points it at the work', async () => {
    const a = await mod.createTrackedWorktree('p1', '/p')
    expect(await mod.finishTrackedWorktree(a.id, 'Add auth')).toEqual({ ok: true, output: 'llm/x' })
    expect(git.commitWorktreeWork).toHaveBeenCalledWith('/p/.worktrees/llm/x', 'Add auth')
    expect(git.removeWorktree).toHaveBeenLastCalledWith('/p', '/p/.worktrees/llm/x', 'llm/x', false)
    expect(git.pointBranchAt).toHaveBeenCalledWith('/p', 'llm/x', 'abc123')
    expect(mod.listWorktrees('p1')).toHaveLength(0)
  })

  it('finish leaves the worktree alone when its work cannot be committed', async () => {
    const a = await mod.createTrackedWorktree('p1', '/p')
    git.commitWorktreeWork.mockResolvedValueOnce({ ok: false, output: '', error: 'nope' } as never)
    expect((await mod.finishTrackedWorktree(a.id, 'Add auth')).ok).toBe(false)
    expect(git.removeWorktree).not.toHaveBeenCalled()
    expect(mod.listWorktrees('p1')).toHaveLength(1)
  })
})
