import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab } from '@/models/types'

type TabStatus = 'idle' | 'busy'

const OUTPUT_BUFFER_SIZE = 10

interface TerminalStore {
  tabs: TerminalTab[]
  activeTabPerProject: Record<string, string>
  tabStatuses: Record<string, TabStatus>
  outputBufferPerProject: Record<string, string[]>
  createTab: (projectId: string, cwd: string, initialCommand?: string) => string
  closeTab: (tabId: string) => void
  replaceTab: (oldTabId: string, projectId: string, cwd: string, initialCommand?: string) => string
  setActiveTab: (projectId: string, tabId: string) => void
  setTabStatus: (tabId: string, status: TabStatus) => void
  setTabTitle: (tabId: string, title: string) => void
  appendOutput: (projectId: string, lines: string[]) => void
  initProject: (projectId: string, cwd: string) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabPerProject: {},
  tabStatuses: {},
  outputBufferPerProject: {},

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

  setTabTitle: (tabId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t))
    }))
  },

  setActiveTab: (projectId: string, tabId: string) => {
    set((state) => ({
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
  },

  appendOutput: (projectId: string, lines: string[]) => {
    set((state) => {
      const existing = state.outputBufferPerProject[projectId] ?? []
      const merged = [...existing, ...lines].slice(-OUTPUT_BUFFER_SIZE)
      return { outputBufferPerProject: { ...state.outputBufferPerProject, [projectId]: merged } }
    })
  },

  initProject: (projectId: string, cwd: string) => {
    const existing = get().tabs.filter((t) => t.projectId === projectId)
    if (existing.length > 0) return
    get().createTab(projectId, cwd, 'claude')
  }
}))
