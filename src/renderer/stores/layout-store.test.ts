import { describe, it, expect, beforeEach } from 'vitest'
import {
  useLayoutStore,
  panelConfigs,
  browserlessPanelConfigs,
  defaultLayout,
  browserlessDefaultLayout,
  getPanelConfigs,
  DEFAULT_TOKEN_CAP
} from './layout-store'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

const resetStore = (): void => {
  useLayoutStore.setState({
    layoutsPerProject: {},
    locksPerProject: {},
    devToolsCollapsedPerProject: {},
    browserlessPerProject: {},
    backgroundImage: null,
    backgroundBlur: 0,
    tokenCap: DEFAULT_TOKEN_CAP,
    idleSoundEnabled: false,
    idleSoundId: DEFAULT_IDLE_SOUND_ID,
    commitPanelEnabled: false,
    resetVersion: 0
  })
}

describe('layout-store', () => {
  beforeEach(resetStore)

  describe('getPanelConfigs', () => {
    it('returns the browser layout configs', () => {
      expect(getPanelConfigs(false)).toBe(panelConfigs)
    })
    it('returns the browserless layout configs', () => {
      expect(getPanelConfigs(true)).toBe(browserlessPanelConfigs)
    })
  })

  describe('getLayout', () => {
    it('returns browserless defaults by default', () => {
      const layout = useLayoutStore.getState().getLayout('p1')
      expect(layout).toEqual(browserlessDefaultLayout)
    })

    it('returns browser defaults when explicitly requested', () => {
      const layout = useLayoutStore.getState().getLayout('p1', false)
      expect(layout).toEqual(defaultLayout)
    })

    it('honours per-project browserless flag', () => {
      useLayoutStore.getState().toggleBrowserless('p1')
      const layout = useLayoutStore.getState().getLayout('p1')
      expect(layout).toEqual(defaultLayout)
    })

    it('fills in missing panels using current variant defaults', () => {
      const partial = [{ i: 'browser-editor', x: 0, y: 0, w: 6, h: 6 }]
      useLayoutStore.setState({ layoutsPerProject: { p1: partial } })
      const layout = useLayoutStore.getState().getLayout('p1')
      const ids = layout.map((l) => l.i).sort()
      expect(ids).toEqual(browserlessDefaultLayout.map((l) => l.i).sort())
    })

    it('strips ids that do not belong to the active variant', () => {
      const mixed = [
        { i: 'browser-editor', x: 0, y: 0, w: 9, h: 12 },
        { i: 'llm-terminals', x: 9, y: 0, w: 3, h: 12 }
      ]
      useLayoutStore.setState({ layoutsPerProject: { p1: mixed } })
      const layout = useLayoutStore.getState().getLayout('p1', true)
      expect(layout.find((l) => l.i === 'llm-terminals')).toBeUndefined()
    })
  })

  describe('saveLayout / togglePanelLock', () => {
    it('persists supplied layout for the project', () => {
      const custom = [{ i: 'browser-editor', x: 0, y: 0, w: 8, h: 8 }]
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

  describe('toggleBrowserless', () => {
    it('flips the flag, drops cached layout, and bumps resetVersion', () => {
      useLayoutStore.getState().saveLayout('p1', [{ i: 'browser-editor', x: 0, y: 0, w: 1, h: 1 }])
      const before = useLayoutStore.getState().resetVersion
      useLayoutStore.getState().toggleBrowserless('p1')
      const state = useLayoutStore.getState()
      expect(state.isBrowserless('p1')).toBe(false)
      expect(state.layoutsPerProject.p1).toBeUndefined()
      expect(state.resetVersion).toBe(before + 1)
    })
  })

  describe('resetLayout', () => {
    it('clears project-specific layout, lock, and devtools state', () => {
      useLayoutStore.getState().saveLayout('p1', [{ i: 'browser-editor', x: 0, y: 0, w: 1, h: 1 }])
      useLayoutStore.getState().togglePanelLock('p1', 'git')
      useLayoutStore.getState().setDevToolsCollapsed('p1', true)
      const before = useLayoutStore.getState().resetVersion
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.layoutsPerProject.p1).toBeUndefined()
      expect(state.locksPerProject.p1).toBeUndefined()
      expect(state.devToolsCollapsedPerProject.p1).toBeUndefined()
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
    it('updates background, blur, idle sound, commit panel', () => {
      useLayoutStore.getState().setBackgroundImage('data:image/png;base64,X')
      useLayoutStore.getState().setBackgroundBlur(8)
      useLayoutStore.getState().setIdleSoundEnabled(true)
      useLayoutStore.getState().setIdleSoundId('chirp')
      useLayoutStore.getState().setCommitPanelEnabled(true)
      const s = useLayoutStore.getState()
      expect(s.backgroundImage).toBe('data:image/png;base64,X')
      expect(s.backgroundBlur).toBe(8)
      expect(s.idleSoundEnabled).toBe(true)
      expect(s.idleSoundId).toBe('chirp')
      expect(s.commitPanelEnabled).toBe(true)
    })
  })
})
