import { findColumn, isAgentColumn, nextColumn, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcTicket } from '@/models/sdlc'

/** What the terminal stage bar needs to know about where a ticket goes from its column. */
export interface TicketTransition {
  column: SdlcColumn
  next: SdlcColumn | null
  isAgent: boolean
  /** The next column is terminal: moving on removes the worktree and keeps the work on its branch. */
  finishes: boolean
  moveOnLabel: string
  moveOnBlockedReason: string | undefined
}

function moveOnLabel(next: SdlcColumn | null): string {
  if (!next) return ''
  return next.kind === 'terminal' ? 'Mark done' : `Skip to ${next.label.toLowerCase()}`
}

/**
 * Tickets move on by themselves once their agent writes its result, so moving
 * by hand is only for an agent that stalled without one. A ticket whose column
 * was removed behind its back is treated as sitting at the start.
 */
export function ticketTransition(ticket: SdlcTicket, columns: readonly SdlcColumn[]): TicketTransition {
  const column = findColumn(columns, ticket.stage) ?? columns[0]
  const next = nextColumn(columns, column.id)
  return {
    column,
    next,
    isAgent: isAgentColumn(column),
    finishes: next?.kind === 'terminal',
    moveOnLabel: moveOnLabel(next),
    moveOnBlockedReason: ticket.status === 'running' ? 'The agent is still working' : undefined
  }
}
