import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcPromptsStore } from '@/stores/sdlc-prompts-store'
import { defaultSdlcColumns } from '@/models/sdlc-flow'
import type { SdlcTicket } from '@/models/sdlc'

export function ticketsInColumn(tickets: readonly SdlcTicket[], columnId: string): SdlcTicket[] {
  return tickets.filter((t) => t.stage === columnId)
}

/** A live agent writes its result under whichever column the ticket is in, so its column cannot go from under it. */
export function columnHasRunningTickets(tickets: readonly SdlcTicket[], columnId: string): boolean {
  return ticketsInColumn(tickets, columnId).some((t) => t.status === 'running')
}

export function deleteColumn(columnId: string, moveTicketsTo: string): boolean {
  const { tickets, reassignStage } = useSdlcStore.getState()
  if (columnHasRunningTickets(tickets, columnId)) return false
  const { columns, removeColumn } = useSdlcFlowStore.getState()
  if (columnId === moveTicketsTo || !columns.some((c) => c.id === moveTicketsTo)) return false
  reassignStage(columnId, moveTicketsTo)
  removeColumn(columnId)
  useSdlcPromptsStore.getState().removeColumnState(columnId)
  return true
}

/** Tickets sitting in a custom column have nowhere to be once the default flow is back, so they return to the start. */
export function resetFlow(): boolean {
  const { columns, resetColumns } = useSdlcFlowStore.getState()
  const defaultIds = new Set(defaultSdlcColumns().map((c) => c.id))
  const removed = columns.filter((c) => !defaultIds.has(c.id))
  const { tickets, reassignStage } = useSdlcStore.getState()
  if (removed.some((c) => columnHasRunningTickets(tickets, c.id))) return false
  resetColumns()
  const first = useSdlcFlowStore.getState().columns[0].id
  for (const column of removed) reassignStage(column.id, first)
  return true
}
