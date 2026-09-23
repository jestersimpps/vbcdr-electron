import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/terminal/TerminalInstance', () => ({
  disposeTerminal: vi.fn(),
  getTerminalInstance: vi.fn(() => undefined)
}))

import { cleanUpMergedWorktrees } from './merged-pr-cleanup'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { SDLC_PROFILE_ID } from '@/config/terminal-profiles'
import type { PrState, TrackedWorktree } from '@/models/types'

function worktree(prState: PrState, overrides: Partial<TrackedWorktree> = {}): TrackedWorktree {
  return {
    id: 'wt1',
    projectId: 'p1',
    projectPath: '/cwd',
    path: '/cwd/.worktrees/llm/add-auth',
    branch: 'llm/add-auth',
    label: null,
    createdAt: 0,
    prUrl: prState === 'none' ? null : 'https://github.com/o/r/pull/7',
    prState,
    hasChanges: false,
    conflictPaths: [],
    lastCheckedAt: null,
    ...overrides
  }
}

function serve(worktrees: TrackedWorktree[]): void {
  vi.mocked(window.api.worktrees.list).mockResolvedValue(worktrees)
  vi.mocked(window.api.worktrees.refreshProject).mockResolvedValue(worktrees)
}

function liveTab(profileId?: string): void {
  useTerminalStore.setState({
    tabs: [{ id: 'tab1', title: 'x', projectId: 'p1', cwd: '/cwd', worktree: { id: 'wt1', path: '/x', branch: 'b' }, profileId }]
  } as never)
}

beforeEach(() => {
  useWorktreeStore.setState({ worktreesPerProject: {} })
  useTerminalStore.setState({ tabs: [] })
  vi.mocked(window.api.worktrees.finish).mockClear()
  const ticket = useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Add auth', attachments: [] })
  useSdlcStore.setState({ tickets: [{ ...ticket, stage: 'done', worktreeId: 'wt1', tabId: 'tab1' }] })
})

describe('cleanUpMergedWorktrees', () => {
  it('removes the worktree of a merged pull request, keeps the branch and marks the ticket merged', async () => {
    serve([worktree('merged')])
    await cleanUpMergedWorktrees('p1')

    expect(window.api.worktrees.finish).toHaveBeenCalledWith('wt1', 'Add auth')
    expect(useSdlcStore.getState().tickets[0]).toMatchObject({
      worktreeId: null,
      tabId: null,
      prState: 'merged',
      prUrl: 'https://github.com/o/r/pull/7'
    })
  })

  it('leaves an open pull request alone but shows it on the card', async () => {
    serve([worktree('open')])
    await cleanUpMergedWorktrees('p1')

    expect(window.api.worktrees.finish).not.toHaveBeenCalled()
    expect(useSdlcStore.getState().tickets[0]).toMatchObject({ worktreeId: 'wt1', prState: 'open' })
  })

  it('does not pull a worktree out from under a tab someone opened by hand', async () => {
    serve([worktree('merged')])
    liveTab()
    await cleanUpMergedWorktrees('p1')
    expect(window.api.worktrees.finish).not.toHaveBeenCalled()
  })

  it('closes a board-driven tab along with the merged worktree', async () => {
    serve([worktree('merged')])
    liveTab(SDLC_PROFILE_ID)
    await cleanUpMergedWorktrees('p1')
    expect(window.api.worktrees.finish).toHaveBeenCalled()
  })

  it('does not ask GitHub about a project without worktrees', async () => {
    serve([])
    vi.mocked(window.api.worktrees.refreshProject).mockClear()
    await cleanUpMergedWorktrees('p1')
    expect(window.api.worktrees.refreshProject).not.toHaveBeenCalled()
  })
})
