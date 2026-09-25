import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_FLOW_ID,
  columnIdFrom,
  defaultSdlcColumns,
  defaultSdlcFlow,
  findFlow,
  isAgentColumn,
  isMiddleColumn,
  newAgentColumn,
  sanitizeColumns,
  sanitizeFlows,
  type SdlcColumn,
  type SdlcFlow
} from '@/models/sdlc-flow'

export type SdlcColumnPatch = Partial<Omit<SdlcColumn, 'id'>>

/** Enough of a ticket to say which flow it runs. */
export interface TicketFlowRef {
  projectId: string
  flowId?: string
}

interface SdlcFlowState {
  flows: SdlcFlow[]
  /** A missing entry, or one naming a deleted flow, means the default flow. */
  flowPerProject: Record<string, string>
  /** Whether a new ticket hands itself to the first agent column, or waits in the first column for its Start button. */
  autoStart: boolean
  addColumn: (flowId: string, label: string, beforeId: string) => SdlcColumn
  updateColumn: (flowId: string, id: string, patch: SdlcColumnPatch) => void
  reorderColumn: (flowId: string, id: string, toIndex: number) => void
  removeColumn: (flowId: string, id: string) => void
  resetColumns: (flowId: string) => void
  saveFlowAs: (fromFlowId: string, name: string) => SdlcFlow
  renameFlow: (flowId: string, name: string) => void
  removeFlow: (flowId: string) => void
  setProjectFlow: (projectId: string, flowId: string) => void
  removeProjectState: (projectId: string) => void
  setAutoStart: (autoStart: boolean) => void
}

const LEGACY_PLAN_VARIABLE = /\{\{plan\}\}/g

/** `{{plan}}` was the only way to read an earlier stage before outputs were keyed by column. */
export function upgradeLegacyPrompt(prompt: string): string {
  return prompt.replace(LEGACY_PLAN_VARIABLE, '{{output.planning}}')
}

function withColumns(
  flows: readonly SdlcFlow[],
  flowId: string,
  update: (columns: SdlcColumn[]) => SdlcColumn[]
): SdlcFlow[] {
  return flows.map((f) => (f.id === flowId ? { ...f, columns: update(f.columns) } : f))
}

export function projectFlow(state: Pick<SdlcFlowState, 'flows' | 'flowPerProject'>, projectId: string): SdlcFlow {
  const chosen = state.flowPerProject[projectId]
  return (chosen && findFlow(state.flows, chosen)) || state.flows[0]
}

interface StoredFlowState {
  flows?: unknown
  flowPerProject?: Record<string, string>
  autoStart?: unknown
  /** One global flow was all there was before flows could be saved. */
  columns?: unknown
}

function storedFlows(incoming: StoredFlowState): SdlcFlow[] {
  if (incoming.flows) return sanitizeFlows(incoming.flows)
  if (incoming.columns) return [{ ...defaultSdlcFlow(), columns: sanitizeColumns(incoming.columns) }]
  return [defaultSdlcFlow()]
}

export const useSdlcFlowStore = create<SdlcFlowState>()(
  persist(
    (set, get) => ({
      flows: [defaultSdlcFlow()],
      flowPerProject: {},
      autoStart: true,

      addColumn: (flowId: string, label: string, beforeId: string) => {
        const columns = findFlow(get().flows, flowId)?.columns ?? []
        const name = label.trim() || 'New column'
        const found = columns.findIndex((c) => c.id === beforeId)
        const index = Math.min(Math.max(found < 0 ? columns.length - 1 : found, 1), columns.length - 1)
        const earlier = columns.slice(0, index).filter(isAgentColumn)
        const column = newAgentColumn(columnIdFrom(name, columns.map((c) => c.id)), name, earlier)
        set((state) => ({
          flows: withColumns(state.flows, flowId, (current) => [
            ...current.slice(0, index),
            column,
            ...current.slice(index)
          ])
        }))
        return column
      },

      updateColumn: (flowId: string, id: string, patch: SdlcColumnPatch) => {
        set((state) => ({
          flows: withColumns(state.flows, flowId, (columns) =>
            sanitizeColumns(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)))
          )
        }))
      },

      reorderColumn: (flowId: string, id: string, toIndex: number) => {
        set((state) => ({
          flows: withColumns(state.flows, flowId, (current) => {
            const from = current.findIndex((c) => c.id === id)
            if (from === toIndex || !isMiddleColumn(current, from) || !isMiddleColumn(current, toIndex)) {
              return current
            }
            const columns = [...current]
            const [moved] = columns.splice(from, 1)
            columns.splice(toIndex, 0, moved)
            return columns
          })
        }))
      },

      removeColumn: (flowId: string, id: string) => {
        set((state) => ({
          flows: withColumns(state.flows, flowId, (columns) => {
            const index = columns.findIndex((c) => c.id === id)
            if (!isMiddleColumn(columns, index)) return columns
            return columns.filter((c) => c.id !== id)
          })
        }))
      },

      resetColumns: (flowId: string) => {
        set((state) => ({ flows: withColumns(state.flows, flowId, () => defaultSdlcColumns()) }))
      },

      saveFlowAs: (fromFlowId: string, name: string) => {
        const { flows } = get()
        const label = name.trim() || 'New flow'
        const source = findFlow(flows, fromFlowId) ?? flows[0]
        const flow: SdlcFlow = {
          id: columnIdFrom(label, flows.map((f) => f.id)),
          name: label,
          columns: source.columns.map((c) => ({ ...c }))
        }
        set({ flows: [...flows, flow] })
        return flow
      },

      renameFlow: (flowId: string, name: string) => {
        set((state) => ({ flows: state.flows.map((f) => (f.id === flowId ? { ...f, name } : f)) }))
      },

      removeFlow: (flowId: string) => {
        if (flowId === DEFAULT_FLOW_ID) return
        set((state) => ({
          flows: state.flows.filter((f) => f.id !== flowId),
          flowPerProject: Object.fromEntries(
            Object.entries(state.flowPerProject).filter(([, chosen]) => chosen !== flowId)
          )
        }))
      },

      setProjectFlow: (projectId: string, flowId: string) => {
        set((state) => ({ flowPerProject: { ...state.flowPerProject, [projectId]: flowId } }))
      },

      removeProjectState: (projectId: string) => {
        set((state) => {
          const flowPerProject = { ...state.flowPerProject }
          delete flowPerProject[projectId]
          return { flowPerProject }
        })
      },

      setAutoStart: (autoStart: boolean) => {
        set({ autoStart })
      }
    }),
    {
      name: 'vbcdr-sdlc-flow',
      partialize: (state) => ({
        flows: state.flows,
        flowPerProject: state.flowPerProject,
        autoStart: state.autoStart
      }),
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as StoredFlowState
        return {
          ...current,
          flows: storedFlows(incoming),
          flowPerProject: incoming.flowPerProject ?? {},
          autoStart: typeof incoming.autoStart === 'boolean' ? incoming.autoStart : current.autoStart
        }
      }
    }
  )
)

/** What a ticket without a flow of its own runs: whatever its project was set to. */
export function ticketFlow(state: Pick<SdlcFlowState, 'flows' | 'flowPerProject'>, ticket: TicketFlowRef): SdlcFlow {
  return (ticket.flowId && findFlow(state.flows, ticket.flowId)) || projectFlow(state, ticket.projectId)
}

export function sdlcColumns(projectId: string): SdlcColumn[] {
  return projectFlow(useSdlcFlowStore.getState(), projectId).columns
}

export function flowColumns(flowId: string): SdlcColumn[] {
  const { flows } = useSdlcFlowStore.getState()
  return (findFlow(flows, flowId) ?? flows[0]).columns
}

export function ticketColumns(ticket: TicketFlowRef): SdlcColumn[] {
  return ticketFlow(useSdlcFlowStore.getState(), ticket).columns
}

export function useTicketColumns(ticket: TicketFlowRef): SdlcColumn[] {
  return useSdlcFlowStore((s) => ticketFlow(s, ticket).columns)
}
