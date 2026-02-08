import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { BrowserTab, DeviceMode, ConsoleEntry, NetworkEntry } from '@/models/types'

interface BrowserStore {
  tabs: BrowserTab[]
  activeTabPerProject: Record<string, string>
  devToolsTab: 'console' | 'network' | 'terminals'
  createTab: (projectId: string) => string
  closeTab: (projectId: string, tabId: string) => void
  setActiveTab: (projectId: string, tabId: string) => void
  setUrl: (tabId: string, url: string) => void
  setDeviceMode: (tabId: string, mode: DeviceMode) => void
  addConsoleEntry: (tabId: string, entry: ConsoleEntry) => void
  addNetworkEntry: (tabId: string, entry: NetworkEntry) => void
  setDevToolsTab: (tab: 'console' | 'network' | 'terminals') => void
  clearConsole: (tabId: string) => void
  clearNetwork: (tabId: string) => void
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tabs: [],
  activeTabPerProject: {},
  devToolsTab: 'console',

  createTab: (projectId: string): string => {
    const tabId = uuid()
    const projectTabs = get().tabs.filter((t) => t.projectId === projectId)
    const tab: BrowserTab = {
      id: tabId,
      title: `Tab ${projectTabs.length + 1}`,
      projectId,
      url: '',
      deviceMode: 'desktop',
      consoleEntries: [],
      networkEntries: []
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
    return tabId
  },

  closeTab: (projectId: string, tabId: string) => {
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== tabId)
      const activeTabPerProject = { ...state.activeTabPerProject }

      if (activeTabPerProject[projectId] === tabId) {
        const remaining = tabs.filter((t) => t.projectId === projectId)
        activeTabPerProject[projectId] = remaining[remaining.length - 1]?.id ?? ''
      }

      return { tabs, activeTabPerProject }
    })
  },

  setActiveTab: (projectId: string, tabId: string) => {
    set((state) => ({
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
  },

  setUrl: (tabId: string, url: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, url } : t))
    }))
  },

  setDeviceMode: (tabId: string, mode: DeviceMode) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, deviceMode: mode } : t))
    }))
    window.api.browser.setDevice(tabId, mode).catch(() => {
      // device mode is best-effort, webview may not be ready
    })
  },

  addConsoleEntry: (tabId: string, entry: ConsoleEntry) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, consoleEntries: [...t.consoleEntries.slice(-499), entry] }
          : t
      )
    }))
  },

  addNetworkEntry: (tabId: string, entry: NetworkEntry) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, networkEntries: [...t.networkEntries.slice(-499), entry] }
          : t
      )
    }))
  },

  setDevToolsTab: (tab: 'console' | 'network' | 'terminals') => set({ devToolsTab: tab }),

  clearConsole: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, consoleEntries: [] } : t))
    }))
  },

  clearNetwork: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, networkEntries: [] } : t))
    }))
  }
}))
