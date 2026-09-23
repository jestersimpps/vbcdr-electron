import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TicketLocation } from './TicketLocation'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import type { SdlcTicket } from '@/models/sdlc'

function ticket(overrides: Partial<SdlcTicket> = {}): SdlcTicket {
  return { ...useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Add auth', attachments: [] }), ...overrides }
}

beforeEach(() => {
  cleanup()
  useSdlcStore.setState({ tickets: [] })
  useWorktreeStore.setState({
    worktreesPerProject: {
      p1: [
        {
          id: 'wt1',
          projectId: 'p1',
          projectPath: '/repo',
          path: '/repo/.worktrees/llm/20260923185206-lwopo2',
          branch: 'llm/add-auth',
          label: null,
          createdAt: 0,
          prUrl: null,
          prState: 'none',
          hasChanges: false,
          conflictPaths: [],
          lastCheckedAt: null
        }
      ]
    }
  })
})

describe('TicketLocation', () => {
  it('shows only the branch while there is no worktree or pull request', () => {
    render(<TicketLocation ticket={ticket()} />)
    expect(screen.getByText('llm/add-auth')).toBeTruthy()
    expect(screen.queryByTitle(/^Open /)).toBeNull()
    expect(screen.queryByText(/PR/)).toBeNull()
  })

  it('adds the worktree, named by its place under .worktrees, and the pull request with its number', () => {
    render(
      <TicketLocation
        ticket={ticket({
          worktreeId: 'wt1',
          worktreePath: '/repo/.worktrees/llm/20260923185206-lwopo2',
          prUrl: 'https://github.com/o/r/pull/7',
          prState: 'open'
        })}
      />
    )
    expect(screen.getByTitle('Open /repo/.worktrees/llm/20260923185206-lwopo2').textContent).toBe(
      'llm/20260923185206-lwopo2'
    )
    expect(screen.getByText('PR #7 open')).toBeTruthy()
  })
  it('hides a worktree the ticket still names but that no longer exists', () => {
    render(<TicketLocation ticket={ticket({ worktreeId: 'gone', worktreePath: '/repo/.worktrees/llm/old' })} />)
    expect(screen.queryByTitle(/^Open /)).toBeNull()
  })
})
