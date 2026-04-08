import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout } from 'react-grid-layout'

export type PanelId = 'browser-editor' | 'git' | 'llm-terminals'

export const GRID_COLS = 12
export const GRID_ROWS = 12

export interface PanelConfig {
  id: PanelId
  title: string
}

export const panelConfigs: PanelConfig[] = [
  { id: 'browser-editor', title: 'Browser / Editor' },
  { id: 'git', title: 'Git' },
  { id: 'llm-terminals', title: 'LLM Coding Terminals' }
]

export const browserlessPanelConfigs: PanelConfig[] = [
  { id: 'browser-editor', title: 'Terminals' },
  { id: 'git', title: 'Git' }
]

const validPanelIds = new Set<string>(panelConfigs.map((p) => p.id))
const browserlessValidPanelIds = new Set<string>(browserlessPanelConfigs.map((p) => p.id))

export const defaultLayout: Layout[] = [
  { i: 'browser-editor', x: 0, y: 0, w: 7, h: 12, minW: 4, minH: 3 },
  { i: 'git', x: 7, y: 0, w: 5, h: 5, minW: 3, minH: 3 },
  { i: 'llm-terminals', x: 7, y: 5, w: 5, h: 7, minW: 3, minH: 2 }
]

export const browserlessDefaultLayout: Layout[] = [
  { i: 'browser-editor', x: 0, y: 0, w: 9, h: 12, minW: 4, minH: 3 },
  { i: 'git', x: 9, y: 0, w: 3, h: 12, minW: 2, minH: 3 }
]

export function getPanelConfigs(browserless: boolean): PanelConfig[] {
  return browserless ? browserlessPanelConfigs : panelConfigs
}

interface LayoutState {
  layoutsPerProject: Record<string, Layout[]>
  locksPerProject: Record<string, Record<string, boolean>>
  devToolsCollapsedPerProject: Record<string, boolean>
  browserlessPerProject: Record<string, boolean>
  backgroundImage: string | null
  backgroundBlur: number
  resetVersion: number
  getLayout: (projectId: string, browserless?: boolean) => Layout[]
  isLocked: (projectId: string, panelId: PanelId) => boolean
  isDevToolsCollapsed: (projectId: string) => boolean
  isBrowserless: (projectId: string) => boolean
  saveLayout: (projectId: string, newLayout: Layout[]) => void
  togglePanelLock: (projectId: string, id: PanelId) => void
  setDevToolsCollapsed: (projectId: string, collapsed: boolean) => void
  toggleBrowserless: (projectId: string) => void
  resetLayout: (projectId: string) => void
  setBackgroundImage: (dataUrl: string | null) => void
  setBackgroundBlur: (blur: number) => void
}

function ensureComplete(layout: Layout[], browserless: boolean): Layout[] {
  const ids = browserless ? browserlessValidPanelIds : validPanelIds
  const defaults = browserless ? browserlessDefaultLayout : defaultLayout
  const filtered = layout.filter((l) => ids.has(l.i))
  const present = new Set(filtered.map((l) => l.i))
  const missing = defaults.filter((d) => !present.has(d.i))
  return missing.length > 0 ? [...filtered, ...missing] : filtered
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layoutsPerProject: {},
      locksPerProject: {},
      devToolsCollapsedPerProject: {},
      browserlessPerProject: {},
      backgroundImage: null,
      backgroundBlur: 0,
      resetVersion: 0,

      getLayout: (projectId: string, browserless?: boolean) => {
        const bl = browserless ?? get().browserlessPerProject[projectId] ?? true
        const defaults = bl ? browserlessDefaultLayout : defaultLayout
        return ensureComplete(get().layoutsPerProject[projectId] ?? defaults, bl)
      },

      isLocked: (projectId: string, panelId: PanelId) => {
        return get().locksPerProject[projectId]?.[panelId] ?? false
      },

      isDevToolsCollapsed: (projectId: string) => {
        return get().devToolsCollapsedPerProject[projectId] ?? false
      },

      isBrowserless: (projectId: string) => {
        return get().browserlessPerProject[projectId] ?? true
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

      toggleBrowserless: (projectId: string) => {
        const current = get().browserlessPerProject[projectId] ?? true
        const lpp = { ...get().layoutsPerProject }
        delete lpp[projectId]
        set({
          browserlessPerProject: {
            ...get().browserlessPerProject,
            [projectId]: !current
          },
          layoutsPerProject: lpp,
          resetVersion: get().resetVersion + 1
        })
      },

      setBackgroundImage: (dataUrl: string | null) => {
        set({ backgroundImage: dataUrl })
      },

      setBackgroundBlur: (blur: number) => {
        set({ backgroundBlur: blur })
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
    }),
    {
      name: 'vbcdr-layout',
      partialize: (state) => ({
        layoutsPerProject: state.layoutsPerProject,
        locksPerProject: state.locksPerProject,
        devToolsCollapsedPerProject: state.devToolsCollapsedPerProject,
        browserlessPerProject: state.browserlessPerProject,
        backgroundImage: state.backgroundImage,
        backgroundBlur: state.backgroundBlur
      })
    }
  )
)
