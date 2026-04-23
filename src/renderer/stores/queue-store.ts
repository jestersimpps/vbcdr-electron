import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'

export interface QueueItem {
  id: string
  text: string
  createdAt: number
}

interface QueueStore {
  itemsPerProject: Record<string, QueueItem[]>
  autoRunPerProject: Record<string, boolean>
  panelOpenPerProject: Record<string, boolean>
  addItem: (projectId: string, text: string) => QueueItem | null
  updateItem: (projectId: string, id: string, text: string) => void
  removeItem: (projectId: string, id: string) => void
  reorderItems: (projectId: string, ids: string[]) => void
  dequeue: (projectId: string) => QueueItem | undefined
  clear: (projectId: string) => void
  setAutoRun: (projectId: string, v: boolean) => void
  setPanelOpen: (projectId: string, v: boolean) => void
  getItems: (projectId: string) => QueueItem[]
  isAutoRun: (projectId: string) => boolean
  isPanelOpen: (projectId: string) => boolean
}

export const useQueueStore = create<QueueStore>()(
  persist(
    (set, get) => ({
      itemsPerProject: {},
      autoRunPerProject: {},
      panelOpenPerProject: {},

      addItem: (projectId: string, text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return null
        const item: QueueItem = { id: uuid(), text: trimmed, createdAt: Date.now() }
        set((state) => ({
          itemsPerProject: {
            ...state.itemsPerProject,
            [projectId]: [...(state.itemsPerProject[projectId] ?? []), item]
          },
          autoRunPerProject: { ...state.autoRunPerProject, [projectId]: true }
        }))
        return item
      },

      updateItem: (projectId: string, id: string, text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return
        set((state) => ({
          itemsPerProject: {
            ...state.itemsPerProject,
            [projectId]: (state.itemsPerProject[projectId] ?? []).map((item) =>
              item.id === id ? { ...item, text: trimmed } : item
            )
          }
        }))
      },

      removeItem: (projectId: string, id: string) => {
        set((state) => ({
          itemsPerProject: {
            ...state.itemsPerProject,
            [projectId]: (state.itemsPerProject[projectId] ?? []).filter((item) => item.id !== id)
          }
        }))
      },

      reorderItems: (projectId: string, ids: string[]) => {
        set((state) => {
          const current = state.itemsPerProject[projectId] ?? []
          const byId = new Map(current.map((item) => [item.id, item]))
          const reordered = ids.map((id) => byId.get(id)).filter((item): item is QueueItem => !!item)
          return {
            itemsPerProject: { ...state.itemsPerProject, [projectId]: reordered }
          }
        })
      },

      dequeue: (projectId: string) => {
        const current = get().itemsPerProject[projectId] ?? []
        if (current.length === 0) return undefined
        const [head, ...rest] = current
        set((state) => ({
          itemsPerProject: { ...state.itemsPerProject, [projectId]: rest }
        }))
        return head
      },

      clear: (projectId: string) => {
        set((state) => ({
          itemsPerProject: { ...state.itemsPerProject, [projectId]: [] }
        }))
      },

      setAutoRun: (projectId: string, v: boolean) => {
        set((state) => ({
          autoRunPerProject: { ...state.autoRunPerProject, [projectId]: v }
        }))
      },

      setPanelOpen: (projectId: string, v: boolean) => {
        set((state) => ({
          panelOpenPerProject: { ...state.panelOpenPerProject, [projectId]: v }
        }))
      },

      getItems: (projectId: string) => get().itemsPerProject[projectId] ?? [],
      isAutoRun: (projectId: string) => get().autoRunPerProject[projectId] ?? false,
      isPanelOpen: (projectId: string) => get().panelOpenPerProject[projectId] ?? false
    }),
    {
      name: 'vbcdr-queue',
      partialize: (state) => ({
        itemsPerProject: state.itemsPerProject,
        autoRunPerProject: state.autoRunPerProject,
        panelOpenPerProject: state.panelOpenPerProject
      })
    }
  )
)
