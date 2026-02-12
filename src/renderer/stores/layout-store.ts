import { create } from 'zustand'
import type { Layout } from 'react-grid-layout'

export type PanelId = 'browser-editor' | 'git' | 'claude-terminals'

export const GRID_COLS = 12
export const GRID_ROWS = 12

export interface PanelConfig {
  id: PanelId
  title: string
}

export const panelConfigs: PanelConfig[] = [
  { id: 'browser-editor', title: 'Browser / Editor' },
  { id: 'git', title: 'Git' },
  { id: 'claude-terminals', title: 'Claude Terminals' }
]

const validPanelIds = new Set<string>(panelConfigs.map((p) => p.id))

export const defaultLayout: Layout[] = [
  { i: 'browser-editor', x: 0, y: 0, w: 8, h: 12, minW: 4, minH: 3 },
  { i: 'git', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
  { i: 'claude-terminals', x: 8, y: 5, w: 4, h: 7, minW: 3, minH: 2 }
]

interface LayoutState {
  layoutsPerProject: Record<string, Layout[]>
  locksPerProject: Record<string, Record<string, boolean>>
  devToolsCollapsedPerProject: Record<string, boolean>
  resetVersion: number
  getLayout: (projectId: string) => Layout[]
  isLocked: (projectId: string, panelId: PanelId) => boolean
  isDevToolsCollapsed: (projectId: string) => boolean
  saveLayout: (projectId: string, newLayout: Layout[]) => void
  togglePanelLock: (projectId: string, id: PanelId) => void
  setDevToolsCollapsed: (projectId: string, collapsed: boolean) => void
  resetLayout: (projectId: string) => void
}

function ensureComplete(layout: Layout[]): Layout[] {
  const filtered = layout.filter((l) => validPanelIds.has(l.i))
  const ids = new Set(filtered.map((l) => l.i))
  const missing = defaultLayout.filter((d) => !ids.has(d.i))
  return missing.length > 0 ? [...filtered, ...missing] : filtered
}

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  layoutsPerProject: {},
  locksPerProject: {},
  devToolsCollapsedPerProject: {},
  resetVersion: 0,

  getLayout: (projectId: string) => {
    return ensureComplete(get().layoutsPerProject[projectId] ?? defaultLayout)
  },

  isLocked: (projectId: string, panelId: PanelId) => {
    return get().locksPerProject[projectId]?.[panelId] ?? false
  },

  isDevToolsCollapsed: (projectId: string) => {
    return get().devToolsCollapsedPerProject[projectId] ?? false
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

  setDevToolsCollapsed: (projectId: string, collapsed: boolean) => {
    set({
      devToolsCollapsedPerProject: {
        ...get().devToolsCollapsedPerProject,
        [projectId]: collapsed
      }
    })
  },

  resetLayout: (projectId: string) => {
    const lpp = { ...get().layoutsPerProject }
    const lkp = { ...get().locksPerProject }
    const dcp = { ...get().devToolsCollapsedPerProject }
    delete lpp[projectId]
    delete lkp[projectId]
    delete dcp[projectId]
    set({
      layoutsPerProject: lpp,
      locksPerProject: lkp,
      devToolsCollapsedPerProject: dcp,
      resetVersion: get().resetVersion + 1
    })
  }
}))
