import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout } from 'react-grid-layout'

export type PanelId = 'browser-editor' | 'dev-tools' | 'dev-terminals' | 'git' | 'claude-terminals'

export const GRID_COLS = 12

export interface PanelConfig {
  id: PanelId
  title: string
}

export const panelConfigs: PanelConfig[] = [
  { id: 'browser-editor', title: 'Browser / Editor' },
  { id: 'dev-tools', title: 'DevTools' },
  { id: 'dev-terminals', title: 'Dev Terminals' },
  { id: 'git', title: 'Git' },
  { id: 'claude-terminals', title: 'Claude Terminals' }
]

export const defaultLayout: Layout[] = [
  { i: 'browser-editor', x: 0, y: 0, w: 8, h: 7, minW: 3, minH: 3 },
  { i: 'dev-tools', x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 2 },
  { i: 'dev-terminals', x: 8, y: 4, w: 4, h: 3, minW: 3, minH: 2 },
  { i: 'git', x: 0, y: 7, w: 5, h: 5, minW: 3, minH: 3 },
  { i: 'claude-terminals', x: 5, y: 7, w: 7, h: 5, minW: 3, minH: 3 }
]

interface LayoutState {
  layoutsPerProject: Record<string, Layout[]>
  locksPerProject: Record<string, Record<string, boolean>>
  getLayout: (projectId: string) => Layout[]
  isLocked: (projectId: string, panelId: PanelId) => boolean
  saveLayout: (projectId: string, newLayout: Layout[]) => void
  togglePanelLock: (projectId: string, id: PanelId) => void
  resetLayout: (projectId: string) => void
}

function ensureComplete(layout: Layout[]): Layout[] {
  const ids = new Set(layout.map((l) => l.i))
  const missing = defaultLayout.filter((d) => !ids.has(d.i))
  return missing.length > 0 ? [...layout, ...missing] : layout
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layoutsPerProject: {},
      locksPerProject: {},

      getLayout: (projectId: string) => {
        return ensureComplete(get().layoutsPerProject[projectId] ?? defaultLayout)
      },

      isLocked: (projectId: string, panelId: PanelId) => {
        return get().locksPerProject[projectId]?.[panelId] ?? false
      },

      saveLayout: (projectId: string, newLayout: Layout[]) => {
        set({
          layoutsPerProject: { ...get().layoutsPerProject, [projectId]: newLayout }
        })
      },

      togglePanelLock: (projectId: string, id: PanelId) => {
        const current = get().locksPerProject[projectId] ?? {}
        set({
          locksPerProject: {
            ...get().locksPerProject,
            [projectId]: { ...current, [id]: !current[id] }
          }
        })
      },

      resetLayout: (projectId: string) => {
        const lpp = { ...get().layoutsPerProject }
        const lkp = { ...get().locksPerProject }
        delete lpp[projectId]
        delete lkp[projectId]
        set({ layoutsPerProject: lpp, locksPerProject: lkp })
      }
    }),
    { name: 'vibecoder-layout-v4' }
  )
)
