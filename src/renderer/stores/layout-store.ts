import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout } from 'react-grid-layout'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

export type PanelId = 'workspace' | 'git'

export const GRID_COLS = 12
export const GRID_ROWS = 12

export interface PanelConfig {
  id: PanelId
  title: string
}

export const panelConfigs: PanelConfig[] = [
  { id: 'workspace', title: 'Workspace' },
  { id: 'git', title: 'Git' }
]

const validPanelIds = new Set<string>(panelConfigs.map((p) => p.id))

export const defaultLayout: Layout[] = [
  { i: 'workspace', x: 0, y: 0, w: 9, h: 12, minW: 4, minH: 3 },
  { i: 'git', x: 9, y: 0, w: 3, h: 12, minW: 2, minH: 3 }
]

interface LayoutState {
  layoutsPerProject: Record<string, Layout[]>
  locksPerProject: Record<string, Record<string, boolean>>
  backgroundImage: string | null
  backgroundBlur: number
  tokenCap: number
  idleSoundEnabled: boolean
  idleSoundId: string
  commitPanelEnabled: boolean
  resetVersion: number
  getLayout: (projectId: string) => Layout[]
  isLocked: (projectId: string, panelId: PanelId) => boolean
  saveLayout: (projectId: string, newLayout: Layout[]) => void
  togglePanelLock: (projectId: string, id: PanelId) => void
  resetLayout: (projectId: string) => void
  setBackgroundImage: (dataUrl: string | null) => void
  setBackgroundBlur: (blur: number) => void
  setTokenCap: (cap: number) => void
  setIdleSoundEnabled: (enabled: boolean) => void
  setIdleSoundId: (id: string) => void
  setCommitPanelEnabled: (enabled: boolean) => void
}

export const DEFAULT_TOKEN_CAP = 160_000

function ensureComplete(layout: Layout[]): Layout[] {
  const filtered = layout.filter((l) => validPanelIds.has(l.i))
  const present = new Set(filtered.map((l) => l.i))
  const missing = defaultLayout.filter((d) => !present.has(d.i))
  return missing.length > 0 ? [...filtered, ...missing] : filtered
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layoutsPerProject: {},
      locksPerProject: {},
      backgroundImage: null,
      backgroundBlur: 0,
      tokenCap: DEFAULT_TOKEN_CAP,
      idleSoundEnabled: false,
      idleSoundId: DEFAULT_IDLE_SOUND_ID,
      commitPanelEnabled: false,
      resetVersion: 0,

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

      setBackgroundImage: (dataUrl: string | null) => {
        set({ backgroundImage: dataUrl })
      },

      setBackgroundBlur: (blur: number) => {
        set({ backgroundBlur: blur })
      },

      setTokenCap: (cap: number) => {
        const safe = Number.isFinite(cap) && cap > 0 ? Math.round(cap) : DEFAULT_TOKEN_CAP
        set({ tokenCap: safe })
      },

      setIdleSoundEnabled: (enabled: boolean) => {
        set({ idleSoundEnabled: enabled })
      },

      setIdleSoundId: (id: string) => {
        set({ idleSoundId: id })
      },

      setCommitPanelEnabled: (enabled: boolean) => {
        set({ commitPanelEnabled: enabled })
      },

      resetLayout: (projectId: string) => {
        const lpp = { ...get().layoutsPerProject }
        const lkp = { ...get().locksPerProject }
        delete lpp[projectId]
        delete lkp[projectId]
        set({
          layoutsPerProject: lpp,
          locksPerProject: lkp,
          resetVersion: get().resetVersion + 1
        })
      }
    }),
    {
      name: 'vbcdr-layout',
      partialize: (state) => ({
        layoutsPerProject: state.layoutsPerProject,
        locksPerProject: state.locksPerProject,
        backgroundImage: state.backgroundImage,
        backgroundBlur: state.backgroundBlur,
        tokenCap: state.tokenCap,
        idleSoundEnabled: state.idleSoundEnabled,
        idleSoundId: state.idleSoundId,
        commitPanelEnabled: state.commitPanelEnabled
      })
    }
  )
)
