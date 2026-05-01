import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'

export interface QueueItem {
  id: string
  text: string
  createdAt: number
}

interface QueueStore {
  itemsPerTab: Record<string, QueueItem[]>
  autoRunPerTab: Record<string, boolean>
  panelOpenPerTab: Record<string, boolean>
  addItem: (tabId: string, text: string) => QueueItem | null
  updateItem: (tabId: string, id: string, text: string) => void
  removeItem: (tabId: string, id: string) => void
  reorderItems: (tabId: string, ids: string[]) => void
  dequeue: (tabId: string) => QueueItem | undefined
  clear: (tabId: string) => void
  setAutoRun: (tabId: string, v: boolean) => void
  setPanelOpen: (tabId: string, v: boolean) => void
  clearTab: (tabId: string) => void
  getItems: (tabId: string) => QueueItem[]
  isAutoRun: (tabId: string) => boolean
  isPanelOpen: (tabId: string) => boolean
}

export const useQueueStore = create<QueueStore>()(
  persist(
    (set, get) => ({
      itemsPerTab: {},
      autoRunPerTab: {},
      panelOpenPerTab: {},

      addItem: (tabId: string, text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return null
        const item: QueueItem = { id: uuid(), text: trimmed, createdAt: Date.now() }
        set((state) => ({
          itemsPerTab: {
            ...state.itemsPerTab,
            [tabId]: [...(state.itemsPerTab[tabId] ?? []), item]
          }
        }))
        return item
      },

      updateItem: (tabId: string, id: string, text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return
        set((state) => ({
          itemsPerTab: {
            ...state.itemsPerTab,
            [tabId]: (state.itemsPerTab[tabId] ?? []).map((item) =>
              item.id === id ? { ...item, text: trimmed } : item
            )
          }
        }))
      },

      removeItem: (tabId: string, id: string) => {
        set((state) => ({
          itemsPerTab: {
            ...state.itemsPerTab,
            [tabId]: (state.itemsPerTab[tabId] ?? []).filter((item) => item.id !== id)
          }
        }))
      },

      reorderItems: (tabId: string, ids: string[]) => {
        set((state) => {
          const current = state.itemsPerTab[tabId] ?? []
          const byId = new Map(current.map((item) => [item.id, item]))
          const reordered = ids.map((id) => byId.get(id)).filter((item): item is QueueItem => !!item)
          return {
            itemsPerTab: { ...state.itemsPerTab, [tabId]: reordered }
          }
        })
      },

      dequeue: (tabId: string) => {
        const current = get().itemsPerTab[tabId] ?? []
        if (current.length === 0) return undefined
        const [head, ...rest] = current
        set((state) => ({
          itemsPerTab: { ...state.itemsPerTab, [tabId]: rest }
        }))
        return head
      },

      clear: (tabId: string) => {
        set((state) => ({
          itemsPerTab: { ...state.itemsPerTab, [tabId]: [] }
        }))
      },

      setAutoRun: (tabId: string, v: boolean) => {
        set((state) => ({
          autoRunPerTab: { ...state.autoRunPerTab, [tabId]: v }
        }))
      },

      setPanelOpen: (tabId: string, v: boolean) => {
        set((state) => ({
          panelOpenPerTab: { ...state.panelOpenPerTab, [tabId]: v }
        }))
      },

      clearTab: (tabId: string) => {
        set((state) => {
          const items = { ...state.itemsPerTab }
          const autoRun = { ...state.autoRunPerTab }
          const panelOpen = { ...state.panelOpenPerTab }
          delete items[tabId]
          delete autoRun[tabId]
          delete panelOpen[tabId]
          return { itemsPerTab: items, autoRunPerTab: autoRun, panelOpenPerTab: panelOpen }
        })
      },

      getItems: (tabId: string) => get().itemsPerTab[tabId] ?? [],
      isAutoRun: (tabId: string) => get().autoRunPerTab[tabId] ?? true,
      isPanelOpen: (tabId: string) => get().panelOpenPerTab[tabId] ?? false
    }),
    {
      name: 'vbcdr-queue',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2 && persisted && typeof persisted === 'object') {
          const old = persisted as {
            itemsPerProject?: Record<string, QueueItem[]>
            autoRunPerProject?: Record<string, boolean>
            panelOpenPerProject?: Record<string, boolean>
          }
          return {
            itemsPerTab: old.itemsPerProject ?? {},
            autoRunPerTab: old.autoRunPerProject ?? {},
            panelOpenPerTab: old.panelOpenPerProject ?? {}
          }
        }
        return persisted as Partial<QueueStore>
      },
      partialize: (state) => ({
        itemsPerTab: state.itemsPerTab,
        autoRunPerTab: state.autoRunPerTab,
        panelOpenPerTab: state.panelOpenPerTab
      })
    }
  )
)
