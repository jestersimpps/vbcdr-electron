import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore } from './project-store'
import { useTerminalStore } from './terminal-store'
import { useDevTerminalStore } from './dev-terminal-store'
import type { Project } from '@/models/types'

const reset = (): void => {
  useProjectStore.setState({
    projects: [],
    activeProjectId: null,
    dashboardActive: true,
    statisticsActive: false,
    usageActive: false,
    settingsActive: false
  })
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
  useDevTerminalStore.setState({ tabs: [] })
}

const project = (id: string, name: string): Project => ({
  id,
  name,
  path: `/${name}`,
  lastOpened: 0
})

describe('project-store', () => {
  beforeEach(() => {
    reset()
    vi.mocked(window.api.projects.list).mockReset().mockResolvedValue([])
    vi.mocked(window.api.projects.add).mockReset().mockResolvedValue(null)
    vi.mocked(window.api.projects.remove).mockReset().mockResolvedValue(undefined)
    vi.mocked(window.api.projects.reorder).mockReset().mockResolvedValue(undefined)
    vi.mocked(window.api.terminal.kill).mockReset().mockResolvedValue(undefined)
  })

  describe('loadProjects', () => {
    it('replaces local projects with the API result', async () => {
      const list = [project('a', 'A'), project('b', 'B')]
      vi.mocked(window.api.projects.list).mockResolvedValue(list)
      await useProjectStore.getState().loadProjects()
      expect(useProjectStore.getState().projects).toEqual(list)
    })
  })

  describe('addProject', () => {
    it('reloads list and activates the new project on success', async () => {
      const p = project('a', 'A')
      vi.mocked(window.api.projects.add).mockResolvedValue(p)
      vi.mocked(window.api.projects.list).mockResolvedValue([p])
      const result = await useProjectStore.getState().addProject()
      const state = useProjectStore.getState()
      expect(result).toEqual(p)
      expect(state.projects).toEqual([p])
      expect(state.activeProjectId).toBe('a')
      expect(state.dashboardActive).toBe(false)
    })

    it('does nothing when the API returns null', async () => {
      vi.mocked(window.api.projects.add).mockResolvedValue(null)
      const result = await useProjectStore.getState().addProject()
      expect(result).toBeNull()
      expect(useProjectStore.getState().activeProjectId).toBeNull()
    })
  })

  describe('removeProject', () => {
    it('kills tabs for the project, removes it, and clears active when matching', async () => {
      const p = project('a', 'A')
      useProjectStore.setState({ projects: [p], activeProjectId: 'a', dashboardActive: false })
      useTerminalStore.getState().createTab('a', '/A', 'claude')
      useDevTerminalStore.getState().createTab('a', '/A')
      vi.mocked(window.api.projects.list).mockResolvedValue([])
      await useProjectStore.getState().removeProject('a')
      expect(window.api.terminal.kill).toHaveBeenCalledTimes(2)
      expect(window.api.projects.remove).toHaveBeenCalledWith('a')
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBeNull()
      expect(state.dashboardActive).toBe(true)
    })

    it('leaves activeProjectId untouched when removing a non-active project', async () => {
      useProjectStore.setState({ projects: [project('a', 'A'), project('b', 'B')], activeProjectId: 'a', dashboardActive: false })
      vi.mocked(window.api.projects.list).mockResolvedValue([project('a', 'A')])
      await useProjectStore.getState().removeProject('b')
      expect(useProjectStore.getState().activeProjectId).toBe('a')
    })
  })

  describe('reorderProjects', () => {
    it('moves a project and notifies the API', () => {
      const list = [project('a', 'A'), project('b', 'B'), project('c', 'C')]
      useProjectStore.setState({ projects: list })
      useProjectStore.getState().reorderProjects(0, 2)
      expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['b', 'c', 'a'])
      expect(window.api.projects.reorder).toHaveBeenCalledWith(['b', 'c', 'a'])
    })

    it('is a no-op on out-of-range indices', () => {
      const list = [project('a', 'A')]
      useProjectStore.setState({ projects: list })
      useProjectStore.getState().reorderProjects(0, 5)
      expect(useProjectStore.getState().projects).toEqual(list)
      expect(window.api.projects.reorder).not.toHaveBeenCalled()
    })
  })

  describe('view selectors', () => {
    it('setActiveProject clears all view flags', () => {
      useProjectStore.setState({ dashboardActive: true })
      useProjectStore.getState().setActiveProject('a')
      const s = useProjectStore.getState()
      expect(s.activeProjectId).toBe('a')
      expect(s.dashboardActive).toBe(false)
    })

    it('show* methods set their flag and clear the others', () => {
      useProjectStore.getState().showStatistics()
      let s = useProjectStore.getState()
      expect(s.statisticsActive).toBe(true)
      expect(s.dashboardActive).toBe(false)
      expect(s.usageActive).toBe(false)

      useProjectStore.getState().showUsage()
      s = useProjectStore.getState()
      expect(s.usageActive).toBe(true)
      expect(s.statisticsActive).toBe(false)

      useProjectStore.getState().showSettings()
      s = useProjectStore.getState()
      expect(s.settingsActive).toBe(true)
      expect(s.usageActive).toBe(false)

      useProjectStore.getState().showDashboard()
      s = useProjectStore.getState()
      expect(s.dashboardActive).toBe(true)
      expect(s.settingsActive).toBe(false)
    })

    it('activeProject() returns matching project or undefined', () => {
      useProjectStore.setState({ projects: [project('a', 'A')], activeProjectId: 'a' })
      expect(useProjectStore.getState().activeProject()?.id).toBe('a')
      useProjectStore.setState({ activeProjectId: 'missing' })
      expect(useProjectStore.getState().activeProject()).toBeUndefined()
    })
  })
})
