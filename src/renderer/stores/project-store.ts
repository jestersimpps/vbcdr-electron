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
  claudePageActive: boolean
  skillsPageActive: boolean
  terminalsPageActive: boolean
  loadProjects: () => Promise<void>
  addProject: () => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  reorderProjects: (fromIndex: number, toIndex: number) => void
  setActiveProject: (id: string) => void
  showDashboard: () => void
  showStatistics: () => void
  showUsage: () => void
  showSettings: () => void
  showClaudePage: () => void
  showSkillsPage: () => void
  showTerminalsPage: () => void
  activeProject: () => Project | undefined
}

const PAGES_OFF = {
  dashboardActive: false,
  statisticsActive: false,
  usageActive: false,
  settingsActive: false,
  claudePageActive: false,
  skillsPageActive: false,
  terminalsPageActive: false
} as const

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  dashboardActive: true,
  statisticsActive: false,
  usageActive: false,
  settingsActive: false,
  claudePageActive: false,
  skillsPageActive: false,
  terminalsPageActive: false,

  loadProjects: async () => {
    const projects = await window.api.projects.list()
    set({ projects })
  },

  addProject: async () => {
    const project = await window.api.projects.add()
    if (project) {
      await get().loadProjects()
      set({ activeProjectId: project.id, ...PAGES_OFF })
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
      set({ activeProjectId: null, ...PAGES_OFF, dashboardActive: true })
    }
    await state.loadProjects()
  },

  reorderProjects: (fromIndex: number, toIndex: number) => {
    set((state) => {
      if (fromIndex === toIndex) return state
      if (fromIndex < 0 || fromIndex >= state.projects.length) return state
      if (toIndex < 0 || toIndex >= state.projects.length) return state
      const reordered = [...state.projects]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      void window.api.projects.reorder(reordered.map((p) => p.id))
      return { projects: reordered }
    })
  },

  setActiveProject: (id: string) => {
    set({ activeProjectId: id, ...PAGES_OFF })
  },

  showDashboard: () => {
    set({ ...PAGES_OFF, dashboardActive: true })
  },

  showStatistics: () => {
    set({ ...PAGES_OFF, statisticsActive: true })
  },

  showUsage: () => {
    set({ ...PAGES_OFF, usageActive: true })
  },

  showSettings: () => {
    set({ ...PAGES_OFF, settingsActive: true })
  },

  showClaudePage: () => {
    set({ ...PAGES_OFF, claudePageActive: true })
  },

  showSkillsPage: () => {
    set({ ...PAGES_OFF, skillsPageActive: true })
  },

  showTerminalsPage: () => {
    set({ ...PAGES_OFF, terminalsPageActive: true })
  },

  activeProject: () => {
    const state = get()
    return state.projects.find((p) => p.id === state.activeProjectId)
  }
}))
