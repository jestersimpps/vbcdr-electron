import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const moveTicketOnMock = vi.fn(async () => undefined)
vi.mock('@/lib/sdlc-handover', () => ({
  moveTicketOn: (...a: unknown[]) => moveTicketOnMock(...(a as []))
}))

import { NewTicketComposer } from './NewTicketComposer'
import { useSdlcStore } from '@/stores/sdlc-store'

beforeEach(() => {
  cleanup()
  moveTicketOnMock.mockClear()
  useSdlcStore.setState({ tickets: [] })
})

describe('NewTicketComposer', () => {
  it('creates the ticket inline and starts its flow straight away', () => {
    render(<NewTicketComposer projectId="p1" projectName="vbcdr" />)
    fireEvent.click(screen.getByRole('button', { name: /new ticket/i }))
    fireEvent.change(screen.getByLabelText('New ticket in vbcdr'), { target: { value: 'Add a scoreboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const [ticket] = useSdlcStore.getState().tickets
    expect(ticket).toMatchObject({ projectId: 'p1', title: 'Add a scoreboard', stage: 'backlog' })
    expect(moveTicketOnMock).toHaveBeenCalledWith(ticket.id)
    expect(screen.queryByLabelText('New ticket in vbcdr')).toBeNull()
  })

  it('starts the flow on Enter and keeps Shift+Enter for a new line', () => {
    render(<NewTicketComposer projectId="p1" projectName="vbcdr" />)
    fireEvent.click(screen.getByRole('button', { name: /new ticket/i }))
    const textarea = screen.getByLabelText('New ticket in vbcdr')
    fireEvent.change(textarea, { target: { value: 'Add a scoreboard' } })

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(useSdlcStore.getState().tickets).toHaveLength(0)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    const [ticket] = useSdlcStore.getState().tickets
    expect(ticket).toMatchObject({ projectId: 'p1', title: 'Add a scoreboard', stage: 'backlog' })
    expect(moveTicketOnMock).toHaveBeenCalledWith(ticket.id)
    expect(screen.queryByLabelText('New ticket in vbcdr')).toBeNull()
  })

  it('will not start an empty ticket, and Escape closes it', () => {
    render(<NewTicketComposer projectId="p1" projectName="vbcdr" />)
    fireEvent.click(screen.getByRole('button', { name: /new ticket/i }))
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.keyDown(screen.getByLabelText('New ticket in vbcdr'), { key: 'Escape' })

    expect(screen.queryByLabelText('New ticket in vbcdr')).toBeNull()
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })
})
