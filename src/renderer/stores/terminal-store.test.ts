import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTerminalStore } from './terminal-store'

const reset = (): void => {
  useTerminalStore.setState({
    tabs: [],
    activeTabPerProject: {},
    tabStatuses: {},
    outputBufferPerProject: {},
    tokenUsagePerTab: {},
    lastActivityPerProject: {},
    attentionProjectIds: {},
    focusedTabId: null
  })
}

describe('terminal-store', () => {
  beforeEach(() => {
    reset()
    vi.mocked(window.api.terminal.has).mockReset().mockResolvedValue(true)
  })

  describe('createTab', () => {
    it('creates a tab, makes it active, and uses an indexed title for non-LLM tabs', () => {
      const id = useTerminalStore.getState().createTab('p1', '/cwd')
      const state = useTerminalStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].title).toBe('Terminal 1')
      expect(state.activeTabPerProject.p1).toBe(id)
    })

    it('numbers terminals per project', () => {
      useTerminalStore.getState().createTab('p1', '/cwd')
      useTerminalStore.getState().createTab('p1', '/cwd')
      const titles = useTerminalStore.getState().tabs.map((t) => t.title)
      expect(titles).toEqual(['Terminal 1', 'Terminal 2'])
    })

    it('uses LLM title when an initial command is given', () => {
      useTerminalStore.getState().createTab('p1', '/cwd', 'claude')
      expect(useTerminalStore.getState().tabs[0].title).toBe('LLM')
    })
  })

  describe('closeTab', () => {
    it('removes the tab and reassigns active to the most recent remaining', () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd')
      const b = useTerminalStore.getState().createTab('p1', '/cwd')
      useTerminalStore.getState().closeTab(b)
      const state = useTerminalStore.getState()
      expect(state.tabs.map((t) => t.id)).toEqual([a])
      expect(state.activeTabPerProject.p1).toBe(a)
    })

    it('clears active when no tabs remain for project', () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd')
      useTerminalStore.getState().closeTab(a)
      expect(useTerminalStore.getState().activeTabPerProject.p1).toBe('')
    })

    it('clears focusedTabId only when it matches the closed tab', () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd')
      const b = useTerminalStore.getState().createTab('p1', '/cwd')
      useTerminalStore.getState().setFocusedTabId(a)
      useTerminalStore.getState().closeTab(b)
      expect(useTerminalStore.getState().focusedTabId).toBe(a)
      useTerminalStore.getState().closeTab(a)
      expect(useTerminalStore.getState().focusedTabId).toBeNull()
    })

    it('drops associated tabStatuses and tokenUsagePerTab entries', () => {
      const id = useTerminalStore.getState().createTab('p1', '/cwd')
      useTerminalStore.getState().setTabStatus(id, 'busy')
      useTerminalStore.getState().setTokenUsage(id, 100)
      useTerminalStore.getState().closeTab(id)
      expect(useTerminalStore.getState().tabStatuses[id]).toBeUndefined()
      expect(useTerminalStore.getState().tokenUsagePerTab[id]).toBeUndefined()
    })
  })

  describe('replaceTab', () => {
    it('swaps an old tab for a new one with the same project', () => {
      const old = useTerminalStore.getState().createTab('p1', '/cwd')
      const next = useTerminalStore.getState().replaceTab(old, 'p1', '/cwd', 'claude')
      const state = useTerminalStore.getState()
      expect(state.tabs.map((t) => t.id)).toEqual([next])
      expect(state.activeTabPerProject.p1).toBe(next)
      expect(state.tabs[0].title).toBe('LLM')
    })
  })

  describe('reorderTabs', () => {
    it('reorders tabs within a project, preserves other projects', () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd')
      const b = useTerminalStore.getState().createTab('p1', '/cwd')
      const c = useTerminalStore.getState().createTab('p1', '/cwd')
      const x = useTerminalStore.getState().createTab('p2', '/cwd')
      useTerminalStore.getState().reorderTabs('p1', 0, 2)
      const p1 = useTerminalStore.getState().tabs.filter((t) => t.projectId === 'p1').map((t) => t.id)
      expect(p1).toEqual([b, c, a])
      const p2 = useTerminalStore.getState().tabs.filter((t) => t.projectId === 'p2').map((t) => t.id)
      expect(p2).toEqual([x])
    })

    it('returns state unchanged for invalid indices', () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd')
      useTerminalStore.getState().reorderTabs('p1', 0, 5)
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a])
    })
  })

  describe('setOutput', () => {
    it('caps output buffer at 10 lines', () => {
      const lines = Array.from({ length: 25 }, (_, i) => `line${i}`)
      useTerminalStore.getState().setOutput('p1', lines)
      const buf = useTerminalStore.getState().outputBufferPerProject.p1
      expect(buf).toHaveLength(10)
      expect(buf[0]).toBe('line15')
      expect(buf[9]).toBe('line24')
    })
  })

  describe('attention', () => {
    it('mark and clear project attention', () => {
      useTerminalStore.getState().markProjectAttention('p1')
      expect(useTerminalStore.getState().attentionProjectIds.p1).toBe(true)
      useTerminalStore.getState().clearProjectAttention('p1')
      expect(useTerminalStore.getState().attentionProjectIds.p1).toBeUndefined()
    })

    it('clearProjectAttention is a no-op for unknown ids', () => {
      const before = useTerminalStore.getState()
      useTerminalStore.getState().clearProjectAttention('nope')
      expect(useTerminalStore.getState()).toBe(before)
    })
  })

  describe('initProject', () => {
    it('creates a new claude tab when none exist', async () => {
      await useTerminalStore.getState().initProject('p1', '/cwd')
      const tabs = useTerminalStore.getState().tabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0].title).toBe('LLM')
      expect(tabs[0].initialCommand).toBe('claude')
    })

    it('skips creation when a live tab exists', async () => {
      useTerminalStore.getState().createTab('p1', '/cwd', 'claude')
      vi.mocked(window.api.terminal.has).mockResolvedValue(true)
      await useTerminalStore.getState().initProject('p1', '/cwd')
      expect(useTerminalStore.getState().tabs).toHaveLength(1)
    })

    it('prunes dead tabs and creates a new one if all dead', async () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd', 'claude')
      vi.mocked(window.api.terminal.has).mockResolvedValueOnce(false)
      await useTerminalStore.getState().initProject('p1', '/cwd')
      const tabs = useTerminalStore.getState().tabs
      expect(tabs.find((t) => t.id === a)).toBeUndefined()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].initialCommand).toBe('claude')
    })

    it('keeps live tabs when one of multiple is dead, no new creation', async () => {
      const a = useTerminalStore.getState().createTab('p1', '/cwd', 'claude')
      const b = useTerminalStore.getState().createTab('p1', '/cwd', 'claude')
      vi.mocked(window.api.terminal.has)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
      await useTerminalStore.getState().initProject('p1', '/cwd')
      const tabs = useTerminalStore.getState().tabs
      expect(tabs.map((t) => t.id)).toEqual([b])
      expect(tabs).toHaveLength(1)
      void a
    })
  })
})
