import {
  columnLayout,
  findColumn,
  isAgentColumn,
  nextColumn,
  sendBackTarget,
  type SdlcColumn,
  type SdlcColumnLayout
} from '@/models/sdlc-flow'
import type { SdlcTicket } from '@/models/sdlc'

export const WRAP_UP_LABEL = 'Wrap up & open PR'

/** Everything the modal footer and the terminal stage bar need to know about where a ticket can go from its column. */
export interface TicketTransition {
  column: SdlcColumn
  layout: SdlcColumnLayout
  next: SdlcColumn | null
  sendBack: SdlcColumn | null
  isAgent: boolean
  /** Leaving opens the commit, push and pull-request workflow in the agent's tab first. */
  wrapsUp: boolean
  /** The next column is terminal: moving on removes the worktree and keeps the work on its branch. */
  finishes: boolean
  outputReady: boolean
  moveOnLabel: string
  /** Why the column's result cannot be acted on yet. */
  outputBlockedReason: string | undefined
  /** Marking done is never held up by a missing result: abandoning a finished-enough ticket is a person's call. */
  moveOnBlockedReason: string | undefined
}

function moveOnLabel(column: SdlcColumn, next: SdlcColumn | null, isFirst: boolean): string {
  if (!next) return ''
  if (next.kind === 'terminal') return 'Mark done'
  if (isAgentColumn(column)) return `Approve ${column.outputLabel}`
  return `${isFirst ? 'Start' : 'Send to'} ${next.label.toLowerCase()}`
}

/** A ticket whose column was removed behind its back is treated as sitting at the start rather than crashing the board. */
export function ticketTransition(ticket: SdlcTicket, columns: readonly SdlcColumn[]): TicketTransition {
  const column = findColumn(columns, ticket.stage) ?? columns[0]
  const next = nextColumn(columns, column.id)
  const isAgent = isAgentColumn(column)
  const finishes = next?.kind === 'terminal'
  const outputReady = !isAgent || !!ticket.artifacts.outputs[column.id]
  const runningReason = ticket.status === 'running' ? 'The agent is still working' : undefined
  const outputBlockedReason =
    runningReason ?? (outputReady ? undefined : `Waiting for the agent's ${column.outputLabel}`)
  return {
    column,
    layout: columnLayout(columns, column.id),
    next,
    sendBack: sendBackTarget(columns, column.id),
    isAgent,
    wrapsUp: isAgent && column.exitAction === 'pull-request',
    finishes,
    outputReady,
    moveOnLabel: moveOnLabel(column, next, columns[0].id === column.id),
    outputBlockedReason,
    moveOnBlockedReason: finishes ? runningReason : outputBlockedReason
  }
}
