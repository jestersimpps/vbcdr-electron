import { useSdlcStore } from '@/stores/sdlc-store'
import { ticketFlow, useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcPromptsStore } from '@/stores/sdlc-prompts-store'
import { DEFAULT_FLOW_ID, defaultSdlcColumns, defaultSdlcFlow, findFlow, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcTicket } from '@/models/sdlc'

export function ticketsInColumn(tickets: readonly SdlcTicket[], columnId: string): SdlcTicket[] {
  return tickets.filter((t) => t.stage === columnId)
}

/** A live agent writes its result under whichever column the ticket is in, so its column cannot go from under it. */
export function columnHasRunningTickets(tickets: readonly SdlcTicket[], columnId: string): boolean {
  return ticketsInColumn(tickets, columnId).some((t) => t.status === 'running')
}

/** Column ids repeat across flows, so a change to one flow may only touch the tickets running it. */
export function usesFlow(flowId: string): (ticket: SdlcTicket) => boolean {
  const state = useSdlcFlowStore.getState()
  return (ticket: SdlcTicket) => ticketFlow(state, ticket).id === flowId
}

export function ticketsOnFlow(tickets: readonly SdlcTicket[], flowId: string): SdlcTicket[] {
  return tickets.filter(usesFlow(flowId))
}

function columnsGone(from: readonly SdlcColumn[], to: readonly SdlcColumn[]): SdlcColumn[] {
  const kept = new Set(to.map((c) => c.id))
  return from.filter((c) => !kept.has(c.id))
}

export function deleteColumn(flowId: string, columnId: string, moveTicketsTo: string): boolean {
  if (columnHasRunningTickets(ticketsOnFlow(useSdlcStore.getState().tickets, flowId), columnId)) return false
  const columns = findFlow(useSdlcFlowStore.getState().flows, flowId)?.columns ?? []
  if (columnId === moveTicketsTo || !columns.some((c) => c.id === moveTicketsTo)) return false
  const onFlow = usesFlow(flowId)
  const projectIds = new Set(ticketsOnFlow(useSdlcStore.getState().tickets, flowId).map((t) => t.projectId))
  useSdlcStore.getState().reassignStage(columnId, moveTicketsTo, onFlow)
  useSdlcFlowStore.getState().removeColumn(flowId, columnId)
  useSdlcPromptsStore.getState().removeColumnState(columnId, (projectId) => projectIds.has(projectId))
  return true
}

/** Tickets sitting in a custom column have nowhere to be once the default flow is back, so they return to the start. */
export function resetFlow(flowId: string): boolean {
  const columns = findFlow(useSdlcFlowStore.getState().flows, flowId)?.columns ?? []
  const removed = columnsGone(columns, defaultSdlcColumns())
  const tickets = ticketsOnFlow(useSdlcStore.getState().tickets, flowId)
  if (removed.some((c) => columnHasRunningTickets(tickets, c.id))) return false
  const onFlow = usesFlow(flowId)
  useSdlcFlowStore.getState().resetColumns(flowId)
  const first = defaultSdlcColumns()[0].id
  for (const column of removed) useSdlcStore.getState().reassignStage(column.id, first, onFlow)
  return true
}

/**
 * A ticket keeps the flow it was created with, so changing a project's flow
 * only decides what its next ticket runs. Nothing in flight can be stranded by
 * it, which is why there is no longer anything to block.
 */
export function switchProjectFlow(projectId: string, flowId: string): boolean {
  const flowState = useSdlcFlowStore.getState()
  if (!findFlow(flowState.flows, flowId)) return false
  flowState.setProjectFlow(projectId, flowId)
  return true
}

/**
 * A deleted flow's tickets name a flow that is gone, so they move onto the
 * default one, landing in its first column: nothing about where they sat
 * carries over to a flow that never had that column.
 */
export function deleteFlow(flowId: string): boolean {
  if (flowId === DEFAULT_FLOW_ID) return false
  const store = useSdlcStore.getState()
  const tickets = ticketsOnFlow(store.tickets, flowId)
  if (tickets.some((t) => t.status === 'running')) return false
  const first = (findFlow(useSdlcFlowStore.getState().flows, DEFAULT_FLOW_ID) ?? defaultSdlcFlow()).columns[0].id
  for (const ticket of tickets) {
    store.patchTicket(ticket.id, { flowId: DEFAULT_FLOW_ID, stage: first, status: 'idle', blockedReason: null })
  }
  useSdlcFlowStore.getState().removeFlow(flowId)
  return true
}
