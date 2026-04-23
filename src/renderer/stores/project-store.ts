import { create } from 'zustand'
import { useTerminalStore } from './terminal-store'
import { useDevTerminalStore } from './dev-terminal-store'
import type { Project } from '@/models/types'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  dashboardActive: boolean
  statisticsActive: boolean
  usageActive: boolean
  settingsActive: boolean
  loadProjects: () => Promise<void>
  addProject: () => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  setActiveProject: (id: string) => void
  showDashboard: () => void
  showStatistics: () => void
  showUsage: () => void
  showSettings: () => void
  activeProject: () => Project | undefined
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  dashboardActive: true,
  statisticsActive: false,
  usageActive: false,
  settingsActive: false,

  loadProjects: async () => {
    const projects = await window.api.projects.list()
    set({ projects })
  },

  addProject: async () => {
    const project = await window.api.projects.add()
    if (project) {
      await get().loadProjects()
      set({ activeProjectId: project.id, dashboardActive: false, statisticsActive: false, usageActive: false, settingsActive: false })
    }
    return project
  },

  removeProject: async (id: string) => {
    const termTabs = useTerminalStore.getState().tabs.filter((t) => t.projectId === id)
    const devTabs = useDevTerminalStore.getState().tabs.filter((t) => t.projectId === id)
    await Promise.all(
      [...termTabs, ...devTabs].map((tab) => window.api.terminal.kill(tab.id))
    )
    await window.api.projects.remove(id)
    const state = get()
    if (state.activeProjectId === id) {
      set({ activeProjectId: null, dashboardActive: true, statisticsActive: false, usageActive: false, settingsActive: false })
    }
    await state.loadProjects()
  },

  setActiveProject: (id: string) => {
    set({ activeProjectId: id, dashboardActive: false, statisticsActive: false, usageActive: false, settingsActive: false })
  },

  showDashboard: () => {
    set({ dashboardActive: true, statisticsActive: false, usageActive: false, settingsActive: false })
  },

  showStatistics: () => {
    set({ statisticsActive: true, dashboardActive: false, usageActive: false, settingsActive: false })
  },

  showUsage: () => {
    set({ usageActive: true, dashboardActive: false, statisticsActive: false, settingsActive: false })
  },

  showSettings: () => {
    set({ settingsActive: true, dashboardActive: false, statisticsActive: false, usageActive: false })
  },

  activeProject: () => {
    const state = get()
    return state.projects.find((p) => p.id === state.activeProjectId)
  }
}))
