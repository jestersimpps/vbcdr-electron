import { beforeEach, describe, expect, it } from 'vitest'
import { useSdlcStore } from './sdlc-store'

function persisted(): { tickets: Array<{ id: string; attachments: Array<{ dataUrl: string | null }> }>; stageModels: Record<string, unknown> } {
  const raw = localStorage.getItem('vbcdr-sdlc')
  expect(raw).not.toBeNull()
  return JSON.parse(raw!).state
}

beforeEach(() => {
  useSdlcStore.setState({ tickets: [], stageModels: {}, selectedTicketId: null })
})

describe('sdlc-store persistence', () => {
  it('writes a ticket to localStorage the moment it is created', () => {
    useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Add auth', attachments: [] })
    expect(persisted().tickets).toHaveLength(1)
  })

  it('keeps status changes in the persisted copy', () => {
    const ticket = useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Add auth', attachments: [] })
    useSdlcStore.getState().patchTicket(ticket.id, { status: 'failed', blockedReason: 'boom' })
    const stored = JSON.parse(localStorage.getItem('vbcdr-sdlc')!).state.tickets[0]
    expect(stored.status).toBe('failed')
  })

  it('drops attachment data urls from disk but keeps them in memory', () => {
    useSdlcStore.getState().createTicket({
      projectId: 'p1',
      description: 'With a screenshot',
      attachments: [{ id: 'a1', name: 'shot.png', kind: 'image', dataUrl: 'data:image/png;base64,AAAA' }]
    })
    expect(persisted().tickets[0].attachments[0].dataUrl).toBeNull()
    expect(useSdlcStore.getState().tickets[0].attachments[0].dataUrl).toBe('data:image/png;base64,AAAA')
  })

  it('persists stage model assignments', () => {
    useSdlcStore.getState().setStageAssignment('planning', 'anthropic', 'claude-sonnet-5')
    expect(persisted().stageModels).toEqual({ planning: { provider: 'anthropic', model: 'claude-sonnet-5' } })
  })
})

describe('setStageAssignment', () => {
  it('sets provider and model together and is a no-op when unchanged', () => {
    const store = useSdlcStore.getState()
    store.setStageAssignment('implementing', 'openai', 'gpt-5')
    const before = useSdlcStore.getState().stageModels
    store.setStageAssignment('implementing', 'openai', 'gpt-5')
    expect(useSdlcStore.getState().stageModels).toBe(before)
    expect(before.implementing).toEqual({ provider: 'openai', model: 'gpt-5' })
  })
})

describe('advanceTicket', () => {
  it('moves the stage without claiming the agent is running', () => {
    const ticket = useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Add auth', attachments: [] })
    useSdlcStore.getState().advanceTicket(ticket.id)
    const updated = useSdlcStore.getState().tickets[0]
    expect(updated.stage).toBe('planning')
    expect(updated.status).toBe('idle')
  })
})

describe('pruneOrphans', () => {
  it('removes tickets whose project is not in the keep list', () => {
    useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Keep me', attachments: [] })
    useSdlcStore.getState().createTicket({ projectId: 'p2', description: 'Drop me', attachments: [] })
    useSdlcStore.getState().pruneOrphans(['p1'])
    expect(useSdlcStore.getState().tickets.map((t) => t.projectId)).toEqual(['p1'])
  })

  it('is a no-op on an empty keep list, since that means the caller has not finished loading yet', () => {
    useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Keep me', attachments: [] })
    useSdlcStore.getState().createTicket({ projectId: 'p2', description: 'Also keep me', attachments: [] })
    useSdlcStore.getState().pruneOrphans([])
    expect(useSdlcStore.getState().tickets).toHaveLength(2)
  })
})
