import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const moveTicketOnMock = vi.fn(async () => undefined)
vi.mock('@/lib/sdlc-handover', () => ({
  moveTicketOn: (...a: unknown[]) => moveTicketOnMock(...(a as []))
}))

import { NewTicketComposer } from './NewTicketComposer'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import type { Project } from '@/models/types'

const projects: Project[] = [
  { id: 'p1', name: 'vbcdr', path: '/code/vbcdr', lastOpened: 0 },
  { id: 'p2', name: 'wonderful', path: '/code/wonderful', lastOpened: 0 }
]

beforeEach(() => {
  cleanup()
  moveTicketOnMock.mockClear()
  useSdlcStore.setState({ tickets: [] })
  useSdlcFlowStore.setState({ autoStart: true })
})

function open(defaultProjectId: string | null = 'p1'): void {
  render(<NewTicketComposer projects={projects} defaultProjectId={defaultProjectId} />)
  fireEvent.click(screen.getByRole('button', { name: /new ticket/i }))
}

describe('NewTicketComposer', () => {
  it('creates the ticket inline and starts its flow straight away', () => {
    open()
    fireEvent.change(screen.getByLabelText('New ticket'), { target: { value: 'Add a scoreboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const [ticket] = useSdlcStore.getState().tickets
    expect(ticket).toMatchObject({ projectId: 'p1', title: 'Add a scoreboard', stage: 'backlog' })
    expect(moveTicketOnMock).toHaveBeenCalledWith(ticket.id)
    expect(screen.queryByLabelText('New ticket')).toBeNull()
  })

  it('starts the flow on Enter and keeps Shift+Enter for a new line', () => {
    open()
    const textarea = screen.getByLabelText('New ticket')
    fireEvent.change(textarea, { target: { value: 'Add a scoreboard' } })

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(useSdlcStore.getState().tickets).toHaveLength(0)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    const [ticket] = useSdlcStore.getState().tickets
    expect(ticket).toMatchObject({ projectId: 'p1', title: 'Add a scoreboard', stage: 'backlog' })
    expect(moveTicketOnMock).toHaveBeenCalledWith(ticket.id)
    expect(screen.queryByLabelText('New ticket')).toBeNull()
  })

  it('will not start an empty ticket, and Escape closes it', () => {
    open()
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.keyDown(screen.getByLabelText('New ticket'), { key: 'Escape' })

    expect(screen.queryByLabelText('New ticket')).toBeNull()
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })

  it('files the ticket under the project picked here rather than the open one', () => {
    open()
    fireEvent.change(screen.getByLabelText('Project for the new ticket'), { target: { value: 'p2' } })
    fireEvent.change(screen.getByLabelText('New ticket'), { target: { value: 'Add a scoreboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(useSdlcStore.getState().tickets[0]).toMatchObject({ projectId: 'p2' })
  })

  it('falls back to the first project when the app has none open', () => {
    open(null)
    fireEvent.change(screen.getByLabelText('New ticket'), { target: { value: 'Add a scoreboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(useSdlcStore.getState().tickets[0]).toMatchObject({ projectId: 'p1' })
  })

  it('renders nothing without a project to file a ticket under', () => {
    render(<NewTicketComposer projects={[]} defaultProjectId={null} />)
    expect(screen.queryByRole('button', { name: /new ticket/i })).toBeNull()
  })

  it('leaves the ticket in the first column when auto-start is off', () => {
    useSdlcFlowStore.setState({ autoStart: false })
    open()
    fireEvent.change(screen.getByLabelText('New ticket'), { target: { value: 'Add a scoreboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(useSdlcStore.getState().tickets[0]).toMatchObject({ stage: 'backlog', status: 'idle' })
    expect(moveTicketOnMock).not.toHaveBeenCalled()
  })
})
