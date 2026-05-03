import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

export const DEFAULT_SPLIT = 75

interface LayoutState {
  splitsPerProject: Record<string, number>
  backgroundImage: string | null
  backgroundBlur: number
  tokenCap: number
  idleSoundEnabled: boolean
  idleSoundId: string
  resetVersion: number
  getSplit: (projectId: string) => number
  setSplit: (projectId: string, size: number) => void
  resetLayout: (projectId: string) => void
  setBackgroundImage: (dataUrl: string | null) => void
  setBackgroundBlur: (blur: number) => void
  setTokenCap: (cap: number) => void
  setIdleSoundEnabled: (enabled: boolean) => void
  setIdleSoundId: (id: string) => void
}

export const DEFAULT_TOKEN_CAP = 160_000

function clampSplit(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SPLIT
  if (size < 20) return 20
  if (size > 85) return 85
  return size
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      splitsPerProject: {},
      backgroundImage: null,
      backgroundBlur: 0,
      tokenCap: DEFAULT_TOKEN_CAP,
      idleSoundEnabled: false,
      idleSoundId: DEFAULT_IDLE_SOUND_ID,
      resetVersion: 0,

      getSplit: (projectId: string) => {
        return get().splitsPerProject[projectId] ?? DEFAULT_SPLIT
      },

      setSplit: (projectId: string, size: number) => {
        const safe = clampSplit(size)
        set({
          splitsPerProject: { ...get().splitsPerProject, [projectId]: safe }
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

      resetLayout: (projectId: string) => {
        const spp = { ...get().splitsPerProject }
        delete spp[projectId]
        set({
          splitsPerProject: spp,
          resetVersion: get().resetVersion + 1
        })
      }
    }),
    {
      name: 'vbcdr-layout',
      partialize: (state) => ({
        splitsPerProject: state.splitsPerProject,
        backgroundImage: state.backgroundImage,
        backgroundBlur: state.backgroundBlur,
        tokenCap: state.tokenCap,
        idleSoundEnabled: state.idleSoundEnabled,
        idleSoundId: state.idleSoundId
      })
    }
  )
)
