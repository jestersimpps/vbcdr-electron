import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab } from '@/models/types'

type TabStatus = 'idle' | 'busy'

interface TerminalStore {
  tabs: TerminalTab[]
  activeTabPerProject: Record<string, string>
  tabStatuses: Record<string, TabStatus>
  createTab: (projectId: string, cwd: string, initialCommand?: string) => string
  closeTab: (tabId: string) => void
  replaceTab: (oldTabId: string, projectId: string, cwd: string, initialCommand?: string) => string
  setActiveTab: (projectId: string, tabId: string) => void
  setTabStatus: (tabId: string, status: TabStatus) => void
  initProject: (projectId: string, cwd: string) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabPerProject: {},
  tabStatuses: {},

  createTab: (projectId: string, cwd: string, initialCommand?: string) => {
    const tabId = uuid()
    const projectTabs = get().tabs.filter((t) => t.projectId === projectId)
    const tab: TerminalTab = {
      id: tabId,
      title: initialCommand ? 'LLM' : `Terminal ${projectTabs.length + 1}`,
      projectId,
      cwd,
      initialCommand
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
    return tabId
  },

  closeTab: (tabId: string) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId)
      const tabs = state.tabs.filter((t) => t.id !== tabId)
      const activeTabPerProject = { ...state.activeTabPerProject }

      if (tab && activeTabPerProject[tab.projectId] === tabId) {
        const remaining = tabs.filter((t) => t.projectId === tab.projectId)
        activeTabPerProject[tab.projectId] = remaining[remaining.length - 1]?.id ?? ''
      }

      const tabStatuses = { ...state.tabStatuses }
      delete tabStatuses[tabId]

      return { tabs, activeTabPerProject, tabStatuses }
    })
  },

  replaceTab: (oldTabId: string, projectId: string, cwd: string, initialCommand?: string) => {
    const newTabId = uuid()
    const tab: TerminalTab = {
      id: newTabId,
      title: initialCommand ? 'LLM' : 'Terminal',
      projectId,
      cwd,
      initialCommand
    }
    set((state) => ({
      tabs: [...state.tabs.filter((t) => t.id !== oldTabId), tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: newTabId }
    }))
    return newTabId
  },

  setTabStatus: (tabId: string, status: TabStatus) => {
    set((state) => ({
      tabStatuses: { ...state.tabStatuses, [tabId]: status }
    }))
  },

  setActiveTab: (projectId: string, tabId: string) => {
    set((state) => ({
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
  },

  initProject: (projectId: string, cwd: string) => {
    const existing = get().tabs.filter((t) => t.projectId === projectId)
    if (existing.length > 0) return
    get().createTab(projectId, cwd, 'claude')
  }
}))
