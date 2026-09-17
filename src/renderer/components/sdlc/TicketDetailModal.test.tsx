import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TicketDetailModal } from './TicketDetailModal'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { makePanel } from '@/models/sdlc-flow'
import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'

function ticket(overrides: Partial<SdlcTicket> = {}): SdlcTicket {
  return {
    id: 't-test',
    projectId: 'p1',
    title: 'Persist terminal scrollback',
    description: 'Scrollback is lost when a worktree tab is reopened.',
    stage: 'backlog',
    status: 'idle',
    branch: '—',
    worktreePath: '—',
    worktreeId: null,
    tabId: null,
    agent: 'claude',
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    comments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    blockedReason: null,
    ...overrides
  }
}

beforeEach(() => {
  cleanup()
  useSdlcFlowStore.getState().resetColumns()
  useSdlcStore.setState({ tickets: [], selectedTicketId: null })
})

describe('TicketDetailModal', () => {
  it('renders nothing when no ticket is selected', () => {
    render(<TicketDetailModal ticket={undefined} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens and shows the ticket when one is selected', () => {
    render(<TicketDetailModal ticket={ticket()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Scrollback is lost when a worktree tab is reopened.')).toBeTruthy()
  })

  /**
   * Regression: the seeding effect once depended on ticket.attachments, a new
   * array identity on every store write, which looped render->effect->setState
   * and kept the modal from ever painting.
   */
  it('settles instead of re-rendering forever when attachments is a fresh array', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <TicketDetailModal ticket={ticket({ attachments: [] })} onClose={onClose} />
    )
    for (let i = 0; i < 5; i++) {
      rerender(<TicketDetailModal ticket={ticket({ attachments: [] })} onClose={onClose} />)
    }
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('renders a backlog ticket as an editable textarea', () => {
    render(<TicketDetailModal ticket={ticket({ stage: 'backlog' })} onClose={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Scrollback is lost when a worktree tab is reopened.')
  })

  it('asks before deleting and names the worktree that goes with the ticket', () => {
    render(
      <TicketDetailModal
        ticket={ticket({ stage: 'planning', worktreeId: 'wt1', branch: 'llm/add-auth' })}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/worktree on llm\/add-auth/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete ticket/i })).toBeTruthy()
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })

  it('keeps Approve plan disabled until the agent has written a plan', () => {
    render(<TicketDetailModal ticket={ticket({ stage: 'planning' })} onClose={vi.fn()} />)
    const approve = screen.getByRole('button', { name: /approve plan/i }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(approve.title).toMatch(/waiting for the agent's plan/i)
  })

  it('enables Approve plan once the plan exists and renders it as markdown', () => {
    render(
      <TicketDetailModal
        ticket={ticket({
          stage: 'planning',
          status: 'awaiting-approval',
          artifacts: { ...EMPTY_ARTIFACTS, outputs: { planning: '# Steps\n\n1. add a login form\n2. wire the session' } }
        })}
        onClose={vi.fn()}
      />
    )
    expect((screen.getByRole('button', { name: /approve plan/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeTruthy()
    expect(screen.getByText('add a login form')).toBeTruthy()
  })

  it('renders a non-backlog ticket as read-only text', () => {
    render(
      <TicketDetailModal
        ticket={ticket({ stage: 'review', branch: 'llm/x' })}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByDisplayValue('Scrollback is lost when a worktree tab is reopened.')).toBeNull()
    expect(screen.getByText('Scrollback is lost when a worktree tab is reopened.')).toBeTruthy()
  })

  it('shows existing review comments newest last', () => {
    const t = ticket({
      stage: 'review',
      comments: [
        { id: 'c1', author: 'you', text: 'auth guard is missing', at: 0, sentBack: true },
        { id: 'c2', author: 'you', text: 'looks right now', at: 0, sentBack: false }
      ]
    })
    render(<TicketDetailModal ticket={t} onClose={vi.fn()} />)
    expect(screen.getByText('auth guard is missing')).toBeTruthy()
    expect(screen.getByText('looks right now')).toBeTruthy()
    expect(screen.getByText('Review comments (2)')).toBeTruthy()
  })

  it('adds a comment to the store without moving the ticket', () => {
    const t = ticket({ stage: 'review', worktreeId: 'wt1' })
    useSdlcStore.setState({ tickets: [t], selectedTicketId: t.id })
    render(<TicketDetailModal ticket={t} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Review comment'), {
      target: { value: 'needs a test for the 401 path' }
    })
    fireEvent.click(screen.getByText('Refine'))

    const updated = useSdlcStore.getState().tickets[0]
    expect(updated.comments).toHaveLength(1)
    expect(updated.comments[0].text).toBe('needs a test for the 401 path')
    expect(updated.comments[0].sentBack).toBe(false)
    expect(updated.stage).toBe('review')
  })

  it('does not add an empty comment', () => {
    const t = ticket({ stage: 'review', worktreeId: 'wt1' })
    useSdlcStore.setState({ tickets: [t], selectedTicketId: t.id })
    render(<TicketDetailModal ticket={t} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Review comment'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('Refine'))

    expect(useSdlcStore.getState().tickets[0].comments).toHaveLength(0)
  })

  it('does not offer commenting on a backlog ticket', () => {
    render(<TicketDetailModal ticket={ticket({ stage: 'backlog' })} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Review comment')).toBeNull()
  })
})

describe('stage model assignment', () => {
  beforeEach(() => {
    useSdlcStore.setState({ stageModels: {} })
  })

  it('is global, not per project', () => {
    useSdlcStore.getState().setStageProvider('planning', 'anthropic')
    useSdlcStore.getState().setStageModel('planning', 'claude-opus-5')

    expect(useSdlcStore.getState().stageModels.planning).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5'
    })
    expect(useSdlcStore.getState().stageModels.review).toBeUndefined()
  })

  it('clears the model when the provider changes', () => {
    const store = useSdlcStore.getState()
    store.setStageProvider('planning', 'anthropic')
    store.setStageModel('planning', 'claude-opus-5')
    store.setStageProvider('planning', 'openai')

    expect(useSdlcStore.getState().stageModels.planning).toEqual({
      provider: 'openai',
      model: null
    })
  })

  it('keeps the model when the provider is re-selected unchanged', () => {
    const store = useSdlcStore.getState()
    store.setStageProvider('planning', 'anthropic')
    store.setStageModel('planning', 'claude-opus-5')
    store.setStageProvider('planning', 'anthropic')

    expect(useSdlcStore.getState().stageModels.planning?.model).toBe('claude-opus-5')
  })

  it('ignores a model set for a stage with no provider yet', () => {
    useSdlcStore.getState().setStageModel('review', 'claude-opus-5')
    expect(useSdlcStore.getState().stageModels.review).toBeUndefined()
  })

  it('does not touch tickets', () => {
    const t = ticket({ id: 'a', stage: 'planning', agent: 'claude' })
    useSdlcStore.setState({ tickets: [t], selectedTicketId: null, stageModels: {} })

    useSdlcStore.getState().setStageProvider('planning', 'anthropic')

    expect(useSdlcStore.getState().tickets[0]).toBe(t)
  })
})

describe('sendTicketBack', () => {
  it('records the reason as a comment and keeps earlier ones', () => {
    const t = ticket({
      stage: 'review',
      comments: [{ id: 'c1', author: 'you', text: 'first pass', at: 0, sentBack: false }]
    })
    useSdlcStore.setState({ tickets: [t], selectedTicketId: t.id })

    useSdlcStore.getState().sendTicketBack(t.id, 'schema rename drops data')

    const updated = useSdlcStore.getState().tickets[0]
    expect(updated.comments).toHaveLength(2)
    expect(updated.comments[1].text).toBe('schema rename drops data')
    expect(updated.comments[1].sentBack).toBe(true)
    expect(updated.blockedReason).toBe('schema rename drops data')
    expect(updated.stage).toBe('implementing')
  })

  it('does not record a comment when no reason is given', () => {
    const t = ticket({ stage: 'review' })
    useSdlcStore.setState({ tickets: [t], selectedTicketId: t.id })

    useSdlcStore.getState().sendTicketBack(t.id, '   ')

    const updated = useSdlcStore.getState().tickets[0]
    expect(updated.comments).toHaveLength(0)
    expect(updated.blockedReason).toBe('Sent back for changes')
  })
})

describe('TicketDetailModal with a user-defined column', () => {
  function addAudit(): string {
    const flow = useSdlcFlowStore.getState()
    const column = flow.addColumn('Security audit', 'review')
    flow.updateColumn(column.id, {
      outputLabel: 'findings',
      sendBackTo: 'planning',
      panels: [
        makePanel('reference', { label: 'Approved plan', sourceColumnId: 'planning' }),
        makePanel('output', { label: 'Audit findings', emptyText: 'Still auditing.' })
      ]
    })
    return column.id
  }

  it('builds the body from the column panels and names the buttons after its config', () => {
    const audit = addAudit()
    const t = ticket({
      stage: audit,
      worktreeId: 'wt1',
      artifacts: { ...EMPTY_ARTIFACTS, outputs: { planning: 'the plan', [audit]: '## Nothing critical' } }
    })
    render(<TicketDetailModal ticket={t} onClose={vi.fn()} />)

    expect(screen.getByText('Audit findings')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nothing critical' })).toBeTruthy()
    expect(screen.getByText('Approved plan')).toBeTruthy()
    expect((screen.getByRole('button', { name: /approve findings/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByLabelText('Review comment')).toBeTruthy()
  })

  it('shows the panel empty state and gates the advance on the column output', () => {
    const audit = addAudit()
    render(<TicketDetailModal ticket={ticket({ stage: audit, worktreeId: 'wt1' })} onClose={vi.fn()} />)

    expect(screen.getByText('Still auditing.')).toBeTruthy()
    const approve = screen.getByRole('button', { name: /approve findings/i }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(approve.title).toMatch(/waiting for the agent's findings/i)
  })

  it('sends a rejected ticket to the configured column, not the neighbour', () => {
    const audit = addAudit()
    const t = ticket({ stage: audit, worktreeId: 'wt1' })
    useSdlcStore.setState({ tickets: [t], selectedTicketId: t.id })
    render(<TicketDetailModal ticket={t} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^send back$/i }))
    fireEvent.click(screen.getByRole('button', { name: /send back to planning/i }))

    expect(useSdlcStore.getState().tickets[0].stage).toBe('planning')
  })

  it('hides a reference panel whose source column was deleted instead of breaking', () => {
    const audit = addAudit()
    useSdlcFlowStore.getState().removeColumn('planning')
    render(<TicketDetailModal ticket={ticket({ stage: audit, worktreeId: 'wt1' })} onClose={vi.fn()} />)

    expect(screen.queryByText('Approved plan')).toBeNull()
    expect(screen.getByText('Still auditing.')).toBeTruthy()
  })

  it('offers Mark done from whichever column sits before the terminal one', () => {
    const audit = addAudit()
    useSdlcFlowStore.getState().removeColumn('review')
    render(<TicketDetailModal ticket={ticket({ stage: audit, worktreeId: 'wt1' })} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /mark done/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /wrap up/i })).toBeNull()
  })

  it('treats a ticket whose column no longer exists as sitting at the start', () => {
    render(<TicketDetailModal ticket={ticket({ stage: 'vanished' })} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /start planning/i })).toBeTruthy()
  })
})
