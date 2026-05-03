import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, DEFAULT_SPLIT, DEFAULT_TOKEN_CAP } from './layout-store'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

const resetStore = (): void => {
  useLayoutStore.setState({
    splitsPerProject: {},
    tokenCap: DEFAULT_TOKEN_CAP,
    idleSoundEnabled: false,
    idleSoundId: DEFAULT_IDLE_SOUND_ID,
    resetVersion: 0
  })
}

describe('layout-store', () => {
  beforeEach(resetStore)

  describe('getSplit / setSplit', () => {
    it('returns the default split for an unknown project', () => {
      expect(useLayoutStore.getState().getSplit('p1')).toBe(DEFAULT_SPLIT)
    })

    it('persists supplied split per project', () => {
      useLayoutStore.getState().setSplit('p1', 60)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(60)
      expect(useLayoutStore.getState().getSplit('p2')).toBe(DEFAULT_SPLIT)
    })

    it('clamps out-of-range values', () => {
      useLayoutStore.getState().setSplit('p1', 5)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(20)
      useLayoutStore.getState().setSplit('p1', 99)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(85)
    })

    it('falls back to default when given a non-finite size', () => {
      useLayoutStore.getState().setSplit('p1', NaN)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(DEFAULT_SPLIT)
    })
  })

  describe('resetLayout', () => {
    it('clears project-specific split and bumps resetVersion', () => {
      useLayoutStore.getState().setSplit('p1', 50)
      const before = useLayoutStore.getState().resetVersion
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.splitsPerProject.p1).toBeUndefined()
      expect(state.getSplit('p1')).toBe(DEFAULT_SPLIT)
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
    it('updates idle sound', () => {
      useLayoutStore.getState().setIdleSoundEnabled(true)
      useLayoutStore.getState().setIdleSoundId('chirp')
      const s = useLayoutStore.getState()
      expect(s.idleSoundEnabled).toBe(true)
      expect(s.idleSoundId).toBe('chirp')
    })
  })
})
