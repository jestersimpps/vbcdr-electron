import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BackgroundMode = 'theme' | 'solid' | 'gradient'

interface BackgroundOverrideState {
  mode: BackgroundMode
  solidColor: string
  gradientFrom: string
  gradientTo: string
  gradientAngle: number
  setMode: (mode: BackgroundMode) => void
  setSolidColor: (color: string) => void
  setGradientFrom: (color: string) => void
  setGradientTo: (color: string) => void
  setGradientAngle: (angle: number) => void
  reset: () => void
}

const DEFAULTS = {
  mode: 'theme' as BackgroundMode,
  solidColor: '#0f1117',
  gradientFrom: '#1e1b4b',
  gradientTo: '#0f0a1f',
  gradientAngle: 135
}

function clampAngle(angle: number): number {
  if (!Number.isFinite(angle)) return DEFAULTS.gradientAngle
  const normalized = ((angle % 360) + 360) % 360
  return Math.round(normalized)
}

export const useBackgroundOverrideStore = create<BackgroundOverrideState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setMode: (mode: BackgroundMode) => set({ mode }),
      setSolidColor: (color: string) => set({ solidColor: color }),
      setGradientFrom: (color: string) => set({ gradientFrom: color }),
      setGradientTo: (color: string) => set({ gradientTo: color }),
      setGradientAngle: (angle: number) => set({ gradientAngle: clampAngle(angle) }),
      reset: () => set({ ...DEFAULTS })
    }),
    {
      name: 'vbcdr-background-override',
      partialize: (state) => ({
        mode: state.mode,
        solidColor: state.solidColor,
        gradientFrom: state.gradientFrom,
        gradientTo: state.gradientTo,
        gradientAngle: state.gradientAngle
      })
    }
  )
)

export function buildBackgroundCss(state: Pick<BackgroundOverrideState, 'mode' | 'solidColor' | 'gradientFrom' | 'gradientTo' | 'gradientAngle'>): string | null {
  if (state.mode === 'solid') return state.solidColor
  if (state.mode === 'gradient') {
    return `linear-gradient(${state.gradientAngle}deg, ${state.gradientFrom}, ${state.gradientTo})`
  }
  return null
}
