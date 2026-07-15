import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, DEFAULT_SPLIT, DEFAULT_TOKEN_CAP } from './layout-store'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

const resetStore = (): void => {
  useLayoutStore.setState({
    splitsPerProject: {},
    gitCollapsedPerProject: {},
    tokenCap: DEFAULT_TOKEN_CAP,
    idleSoundEnabled: false,
    idleSoundId: DEFAULT_IDLE_SOUND_ID,
    globalTerminalCwd: '',
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

  describe('toggleGitCollapsed', () => {
    it('toggles per project without affecting others', () => {
      useLayoutStore.getState().toggleGitCollapsed('p1')
      expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(true)
      expect(useLayoutStore.getState().gitCollapsedPerProject.p2).toBeUndefined()

      useLayoutStore.getState().toggleGitCollapsed('p1')
      expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(false)
    })
  })

  describe('setGlobalTerminalCwd', () => {
    it('stores the trimmed path', () => {
      useLayoutStore.getState().setGlobalTerminalCwd('  /Users/me/dev  ')
      expect(useLayoutStore.getState().globalTerminalCwd).toBe('/Users/me/dev')
    })

    it('allows clearing back to empty', () => {
      useLayoutStore.getState().setGlobalTerminalCwd('/x')
      useLayoutStore.getState().setGlobalTerminalCwd('   ')
      expect(useLayoutStore.getState().globalTerminalCwd).toBe('')
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

    it('clears the project git-collapse flag but leaves other projects alone', () => {
      useLayoutStore.getState().toggleGitCollapsed('p1')
      useLayoutStore.getState().toggleGitCollapsed('p2')
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.gitCollapsedPerProject.p1).toBeUndefined()
      expect(state.gitCollapsedPerProject.p2).toBe(true)
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
