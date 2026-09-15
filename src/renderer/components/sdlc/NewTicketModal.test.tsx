import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NewTicketModal } from './NewTicketModal'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'

beforeEach(() => {
  cleanup()
  useSdlcStore.setState({ tickets: [], selectedTicketId: null })
  useTerminalStore.setState({ tabs: [], activeTabPerProject: {}, tabStatuses: {} })
})

describe('NewTicketModal', () => {
  it('creates the ticket in the backlog as written, with no agent involved', () => {
    render(<NewTicketModal isOpen projectId="p1" projectName="vbcdr" onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Let users log in with email' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    const ticket = useSdlcStore.getState().tickets[0]
    expect(ticket.stage).toBe('backlog')
    expect(ticket.status).toBe('idle')
    expect(ticket.title).toBe('Let users log in with email')
    expect(ticket.branch).toBe('llm/let-users-log-in-with-email')
    expect(ticket.tabId).toBeNull()
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
  })
})
