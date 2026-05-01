import { beforeEach, describe, expect, it } from 'vitest'
import { useDevTerminalStore } from './dev-terminal-store'

const reset = (): void => {
  useDevTerminalStore.setState({ tabs: [] })
}

describe('dev-terminal-store', () => {
  beforeEach(() => {
    reset()
  })

  describe('createTab', () => {
    it('appends a tab with an indexed title and returns its id', () => {
      const id = useDevTerminalStore.getState().createTab('p1', '/cwd')
      const state = useDevTerminalStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0]).toEqual({ id, title: 'Dev 1', projectId: 'p1', cwd: '/cwd' })
    })

    it('numbers tabs per project independently', () => {
      useDevTerminalStore.getState().createTab('p1', '/a')
      useDevTerminalStore.getState().createTab('p2', '/b')
      useDevTerminalStore.getState().createTab('p1', '/a')
      const titles = useDevTerminalStore
        .getState()
        .tabs.map((t) => `${t.projectId}:${t.title}`)
      expect(titles).toEqual(['p1:Dev 1', 'p2:Dev 1', 'p1:Dev 2'])
    })

    it('returns unique ids per call', () => {
      const a = useDevTerminalStore.getState().createTab('p1', '/cwd')
      const b = useDevTerminalStore.getState().createTab('p1', '/cwd')
      expect(a).not.toBe(b)
    })
  })

  describe('closeTab', () => {
    it('removes the tab with the matching id and leaves others alone', () => {
      const a = useDevTerminalStore.getState().createTab('p1', '/cwd')
      const b = useDevTerminalStore.getState().createTab('p1', '/cwd')
      useDevTerminalStore.getState().closeTab(a)
      const ids = useDevTerminalStore.getState().tabs.map((t) => t.id)
      expect(ids).toEqual([b])
    })

    it('is a no-op when the id is unknown', () => {
      const a = useDevTerminalStore.getState().createTab('p1', '/cwd')
      useDevTerminalStore.getState().closeTab('does-not-exist')
      const ids = useDevTerminalStore.getState().tabs.map((t) => t.id)
      expect(ids).toEqual([a])
    })
  })

  describe('initProject', () => {
    it('creates the first tab for a project on first call', () => {
      useDevTerminalStore.getState().initProject('p1', '/cwd')
      const tabs = useDevTerminalStore.getState().tabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0]).toMatchObject({ projectId: 'p1', cwd: '/cwd', title: 'Dev 1' })
    })

    it('does nothing when the project already has tabs', () => {
      useDevTerminalStore.getState().createTab('p1', '/cwd')
      useDevTerminalStore.getState().initProject('p1', '/cwd')
      expect(useDevTerminalStore.getState().tabs).toHaveLength(1)
    })

    it('creates a tab for a new project even when other projects already have tabs', () => {
      useDevTerminalStore.getState().createTab('p1', '/a')
      useDevTerminalStore.getState().initProject('p2', '/b')
      const byProject = useDevTerminalStore
        .getState()
        .tabs.map((t) => t.projectId)
        .sort()
      expect(byProject).toEqual(['p1', 'p2'])
    })
  })
})
