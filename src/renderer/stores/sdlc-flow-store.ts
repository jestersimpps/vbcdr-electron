import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useLayoutStore } from '@/stores/layout-store'
import {
  columnIdFrom,
  defaultSdlcColumns,
  newAgentColumn,
  sanitizeColumns,
  type SdlcColumn
} from '@/models/sdlc-flow'

export type SdlcColumnPatch = Partial<Omit<SdlcColumn, 'id'>>

interface SdlcFlowState {
  columns: SdlcColumn[]
  addColumn: (label: string, beforeId: string) => SdlcColumn
  updateColumn: (id: string, patch: SdlcColumnPatch) => void
  moveColumn: (id: string, direction: -1 | 1) => void
  removeColumn: (id: string) => void
  resetColumns: () => void
}

const LEGACY_PLAN_VARIABLE = /\{\{plan\}\}/g

/** `{{plan}}` was the only way to read an earlier stage before outputs were keyed by column. */
export function upgradeLegacyPrompt(prompt: string): string {
  return prompt.replace(LEGACY_PLAN_VARIABLE, '{{output.planning}}')
}

/**
 * Global prompts used to live on the layout store. A flow that was never saved
 * starts from those, so a prompt edited before columns existed carries over.
 */
function seedColumns(): SdlcColumn[] {
  const legacy: Record<string, string> = useLayoutStore.getState().sdlcStagePrompts
  return defaultSdlcColumns().map((column) => {
    const prompt = legacy[column.id]
    return prompt ? { ...column, prompt: upgradeLegacyPrompt(prompt) } : column
  })
}

/** The ends are structural: the first column is where tickets have no worktree yet, the last is where it is gone. */
function isMiddle(columns: SdlcColumn[], index: number): boolean {
  return index > 0 && index < columns.length - 1
}

export const useSdlcFlowStore = create<SdlcFlowState>()(
  persist(
    (set, get) => ({
      columns: seedColumns(),

      addColumn: (label: string, beforeId: string) => {
        const { columns } = get()
        const name = label.trim() || 'New column'
        const column = newAgentColumn(columnIdFrom(name, columns.map((c) => c.id)), name)
        const found = columns.findIndex((c) => c.id === beforeId)
        const index = Math.min(Math.max(found < 0 ? columns.length - 1 : found, 1), columns.length - 1)
        set({ columns: [...columns.slice(0, index), column, ...columns.slice(index)] })
        return column
      },

      updateColumn: (id: string, patch: SdlcColumnPatch) => {
        set((state) => ({
          columns: sanitizeColumns(state.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)))
        }))
      },

      moveColumn: (id: string, direction: -1 | 1) => {
        set((state) => {
          const from = state.columns.findIndex((c) => c.id === id)
          const to = from + direction
          if (!isMiddle(state.columns, from) || !isMiddle(state.columns, to)) return state
          const columns = [...state.columns]
          ;[columns[from], columns[to]] = [columns[to], columns[from]]
          return { columns }
        })
      },

      removeColumn: (id: string) => {
        set((state) => {
          const index = state.columns.findIndex((c) => c.id === id)
          if (!isMiddle(state.columns, index)) return state
          return { columns: state.columns.filter((c) => c.id !== id) }
        })
      },

      resetColumns: () => {
        set({ columns: defaultSdlcColumns() })
      }
    }),
    {
      name: 'vbcdr-sdlc-flow',
      partialize: (state) => ({ columns: state.columns }),
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<SdlcFlowState>
        return { ...current, columns: incoming.columns ? sanitizeColumns(incoming.columns) : current.columns }
      }
    }
  )
)

export function sdlcColumns(): SdlcColumn[] {
  return useSdlcFlowStore.getState().columns
}
