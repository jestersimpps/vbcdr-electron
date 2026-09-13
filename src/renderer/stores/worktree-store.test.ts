import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorktreeStore } from './worktree-store'
import type { TrackedWorktree } from '@/models/types'

const tracked = (overrides: Partial<TrackedWorktree> = {}): TrackedWorktree => ({
  id: 'wt1',
  projectId: 'p1',
  projectPath: '/cwd',
  path: '/cwd/.worktrees/llm/x',
  branch: 'llm/x',
  createdAt: 0,
  prUrl: null,
  prState: 'none',
  hasChanges: false,
  conflictPaths: [],
  lastCheckedAt: null,
  ...overrides
})

const api = (): typeof window.api.worktrees => window.api.worktrees

beforeEach(() => {
  useWorktreeStore.setState({ worktreesPerProject: {}, refreshingPerProject: {}, ghStatus: null })
  vi.mocked(api().list).mockResolvedValue([])
  vi.mocked(api().refreshProject).mockResolvedValue([])
  vi.mocked(api().refresh).mockResolvedValue(null)
  vi.mocked(api().renameBranch).mockResolvedValue({ ok: true, output: '' })
  vi.mocked(api().remove).mockResolvedValue({ ok: true, output: '' })
})

describe('worktree-store', () => {
  it('load stores the list for the project', async () => {
    vi.mocked(api().list).mockResolvedValue([tracked()])
    await useWorktreeStore.getState().load('p1')
    expect(useWorktreeStore.getState().worktreesPerProject.p1).toHaveLength(1)
    expect(api().list).toHaveBeenCalledWith('p1')
  })

  it('create appends the new worktree and returns it', async () => {
    const created = await useWorktreeStore.getState().create('p1', '/cwd')
    expect(created.id).toBe('wt1')
    expect(useWorktreeStore.getState().worktreesPerProject.p1?.map((w) => w.id)).toEqual(['wt1'])
  })

  it('refreshOne drops the entry when main reports it gone', async () => {
    useWorktreeStore.setState({ worktreesPerProject: { p1: [tracked()] } })
    const result = await useWorktreeStore.getState().refreshOne('wt1')
    expect(result).toBeNull()
    expect(useWorktreeStore.getState().worktreesPerProject.p1).toEqual([])
  })

  it('refreshOne replaces the entry with the refreshed one', async () => {
    useWorktreeStore.setState({ worktreesPerProject: { p1: [tracked()] } })
    vi.mocked(api().refresh).mockResolvedValue(tracked({ prState: 'open', prUrl: 'https://x/pr/1' }))
    await useWorktreeStore.getState().refreshOne('wt1')
    expect(useWorktreeStore.getState().worktreesPerProject.p1?.[0].prState).toBe('open')
  })

  it('renameBranch updates the branch locally on success and returns the error otherwise', async () => {
    useWorktreeStore.setState({ worktreesPerProject: { p1: [tracked()] } })
    expect(await useWorktreeStore.getState().renameBranch('wt1', ' feature/y ')).toBeNull()
    expect(useWorktreeStore.getState().worktreesPerProject.p1?.[0].branch).toBe('feature/y')

    vi.mocked(api().renameBranch).mockResolvedValue({ ok: false, output: '', error: 'exists' })
    expect(await useWorktreeStore.getState().renameBranch('wt1', 'main')).toBe('exists')
    expect(useWorktreeStore.getState().worktreesPerProject.p1?.[0].branch).toBe('feature/y')
  })

  it('remove drops the entry on success', async () => {
    useWorktreeStore.setState({ worktreesPerProject: { p1: [tracked(), tracked({ id: 'wt2' })] } })
    expect(await useWorktreeStore.getState().remove('wt1')).toBeNull()
    expect(useWorktreeStore.getState().worktreesPerProject.p1?.map((w) => w.id)).toEqual(['wt2'])
  })

  it('refreshProject is guarded against overlapping calls', async () => {
    let resolve: (v: TrackedWorktree[]) => void = () => undefined
    vi.mocked(api().refreshProject).mockReturnValue(new Promise((r) => { resolve = r }))
    const first = useWorktreeStore.getState().refreshProject('p1')
    await useWorktreeStore.getState().refreshProject('p1')
    expect(api().refreshProject).toHaveBeenCalledTimes(1)
    resolve([tracked()])
    await first
    expect(useWorktreeStore.getState().refreshingPerProject.p1).toBe(false)
    expect(useWorktreeStore.getState().worktreesPerProject.p1).toHaveLength(1)
  })
})
