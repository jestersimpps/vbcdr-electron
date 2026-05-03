import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, defaultLayout, DEFAULT_TOKEN_CAP } from './layout-store'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

const resetStore = (): void => {
  useLayoutStore.setState({
    layoutsPerProject: {},
    locksPerProject: {},
    backgroundImage: null,
    backgroundBlur: 0,
    tokenCap: DEFAULT_TOKEN_CAP,
    idleSoundEnabled: false,
    idleSoundId: DEFAULT_IDLE_SOUND_ID,
    resetVersion: 0
  })
}

describe('layout-store', () => {
  beforeEach(resetStore)

  describe('getLayout', () => {
    it('returns the default layout for an unknown project', () => {
      const layout = useLayoutStore.getState().getLayout('p1')
      expect(layout).toEqual(defaultLayout)
    })

    it('fills in missing panels using defaults', () => {
      const partial = [{ i: 'workspace', x: 0, y: 0, w: 6, h: 6 }]
      useLayoutStore.setState({ layoutsPerProject: { p1: partial } })
      const layout = useLayoutStore.getState().getLayout('p1')
      const ids = layout.map((l) => l.i).sort()
      expect(ids).toEqual(defaultLayout.map((l) => l.i).sort())
    })

    it('strips ids that are not part of the layout', () => {
      const mixed = [
        { i: 'workspace', x: 0, y: 0, w: 9, h: 12 },
        { i: 'unknown', x: 9, y: 0, w: 3, h: 12 }
      ]
      useLayoutStore.setState({ layoutsPerProject: { p1: mixed } })
      const layout = useLayoutStore.getState().getLayout('p1')
      expect(layout.find((l) => l.i === 'unknown')).toBeUndefined()
    })
  })

  describe('saveLayout / togglePanelLock', () => {
    it('persists supplied layout for the project', () => {
      const custom = [{ i: 'workspace', x: 0, y: 0, w: 8, h: 8 }]
      useLayoutStore.getState().saveLayout('p1', custom)
      expect(useLayoutStore.getState().layoutsPerProject.p1).toBe(custom)
    })

    it('toggles panel lock independently per project', () => {
      expect(useLayoutStore.getState().isLocked('p1', 'git')).toBe(false)
      useLayoutStore.getState().togglePanelLock('p1', 'git')
      expect(useLayoutStore.getState().isLocked('p1', 'git')).toBe(true)
      expect(useLayoutStore.getState().isLocked('p2', 'git')).toBe(false)
      useLayoutStore.getState().togglePanelLock('p1', 'git')
      expect(useLayoutStore.getState().isLocked('p1', 'git')).toBe(false)
    })
  })

  describe('resetLayout', () => {
    it('clears project-specific layout and lock state', () => {
      useLayoutStore.getState().saveLayout('p1', [{ i: 'workspace', x: 0, y: 0, w: 1, h: 1 }])
      useLayoutStore.getState().togglePanelLock('p1', 'git')
      const before = useLayoutStore.getState().resetVersion
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.layoutsPerProject.p1).toBeUndefined()
      expect(state.locksPerProject.p1).toBeUndefined()
      expect(state.resetVersion).toBe(before + 1)
    })
  })

  describe('setTokenCap', () => {
    it('rounds positive finite numbers', () => {
      useLayoutStore.getState().setTokenCap(99_999.7)
      expect(useLayoutStore.getState().tokenCap).toBe(100_000)
    })

    it('falls back to default for invalid input', () => {
      useLayoutStore.getState().setTokenCap(0)
      expect(useLayoutStore.getState().tokenCap).toBe(DEFAULT_TOKEN_CAP)
      useLayoutStore.getState().setTokenCap(NaN)
      expect(useLayoutStore.getState().tokenCap).toBe(DEFAULT_TOKEN_CAP)
      useLayoutStore.getState().setTokenCap(-5)
      expect(useLayoutStore.getState().tokenCap).toBe(DEFAULT_TOKEN_CAP)
    })
  })

  describe('simple setters', () => {
    it('updates background, blur, idle sound', () => {
      useLayoutStore.getState().setBackgroundImage('data:image/png;base64,X')
      useLayoutStore.getState().setBackgroundBlur(8)
      useLayoutStore.getState().setIdleSoundEnabled(true)
      useLayoutStore.getState().setIdleSoundId('chirp')
      const s = useLayoutStore.getState()
      expect(s.backgroundImage).toBe('data:image/png;base64,X')
      expect(s.backgroundBlur).toBe(8)
      expect(s.idleSoundEnabled).toBe(true)
      expect(s.idleSoundId).toBe('chirp')
    })
  })
})
