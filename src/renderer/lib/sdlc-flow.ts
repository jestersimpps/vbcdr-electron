import { useSdlcStore } from '@/stores/sdlc-store'
import { projectFlow, useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcPromptsStore } from '@/stores/sdlc-prompts-store'
import { DEFAULT_FLOW_ID, defaultSdlcColumns, findFlow, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcTicket } from '@/models/sdlc'

export function ticketsInColumn(tickets: readonly SdlcTicket[], columnId: string): SdlcTicket[] {
  return tickets.filter((t) => t.stage === columnId)
}

/** A live agent writes its result under whichever column the ticket is in, so its column cannot go from under it. */
export function columnHasRunningTickets(tickets: readonly SdlcTicket[], columnId: string): boolean {
  return ticketsInColumn(tickets, columnId).some((t) => t.status === 'running')
}

/** Column ids repeat across flows, so a change to one flow may only touch the tickets of projects that use it. */
export function usesFlow(flowId: string): (projectId: string) => boolean {
  const state = useSdlcFlowStore.getState()
  return (projectId: string) => projectFlow(state, projectId).id === flowId
}

export function ticketsOnFlow(tickets: readonly SdlcTicket[], flowId: string): SdlcTicket[] {
  const onFlow = usesFlow(flowId)
  return tickets.filter((t) => onFlow(t.projectId))
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
  useSdlcStore.getState().reassignStage(columnId, moveTicketsTo, onFlow)
  useSdlcFlowStore.getState().removeColumn(flowId, columnId)
  useSdlcPromptsStore.getState().removeColumnState(columnId, onFlow)
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

/** A project may switch while none of its agents runs in a column the other flow lacks. */
export function canSwitchProjectFlow(projectId: string, flowId: string): boolean {
  const { flows } = useSdlcFlowStore.getState()
  const target = findFlow(flows, flowId)
  if (!target) return false
  const removed = columnsGone(projectFlow(useSdlcFlowStore.getState(), projectId).columns, target.columns)
  const tickets = useSdlcStore.getState().tickets.filter((t) => t.projectId === projectId)
  return !removed.some((c) => columnHasRunningTickets(tickets, c.id))
}

/** The project's tickets in columns the new flow lacks start over in its first column. */
export function switchProjectFlow(projectId: string, flowId: string): boolean {
  const flowState = useSdlcFlowStore.getState()
  const target = findFlow(flowState.flows, flowId)
  if (!target || !canSwitchProjectFlow(projectId, flowId)) return false
  const removed = columnsGone(projectFlow(flowState, projectId).columns, target.columns)
  flowState.setProjectFlow(projectId, flowId)
  const first = target.columns[0].id
  const inProject = (id: string): boolean => id === projectId
  for (const column of removed) useSdlcStore.getState().reassignStage(column.id, first, inProject)
  return true
}

/** The projects on a deleted flow go back to the default one, under the same rule as switching by hand. */
export function deleteFlow(flowId: string): boolean {
  if (flowId === DEFAULT_FLOW_ID) return false
  const projectIds = Object.entries(useSdlcFlowStore.getState().flowPerProject)
    .filter(([, chosen]) => chosen === flowId)
    .map(([projectId]) => projectId)
  if (!projectIds.every((id) => canSwitchProjectFlow(id, DEFAULT_FLOW_ID))) return false
  for (const projectId of projectIds) switchProjectFlow(projectId, DEFAULT_FLOW_ID)
  useSdlcFlowStore.getState().removeFlow(flowId)
  return true
}
