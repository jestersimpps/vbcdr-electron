import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  BrowserTab,
  DeviceMode,
  ConsoleEntry,
  NetworkEntry,
  PersistedBrowserTab
} from '@/models/types'

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function debouncedSave(projectId: string): void {
  const existing = debounceTimers.get(projectId)
  if (existing) clearTimeout(existing)

  debounceTimers.set(
    projectId,
    setTimeout(() => {
      debounceTimers.delete(projectId)
      const state = useBrowserStore.getState()
      const projectTabs = state.tabs.filter((t) => t.projectId === projectId)
      const persisted: PersistedBrowserTab[] = projectTabs.map((t) => ({
        id: t.id,
        url: t.url,
        deviceMode: t.deviceMode,
        title: t.title
      }))
      const activeTabId = state.activeTabPerProject[projectId] ?? ''
      window.api.browser.saveTabs(projectId, persisted, activeTabId)
    }, 500)
  )
}

interface BrowserStore {
  tabs: BrowserTab[]
  activeTabPerProject: Record<string, string>
  devToolsTab: 'console' | 'network' | 'passwords'
  createTab: (projectId: string) => string
  closeTab: (projectId: string, tabId: string) => void
  setActiveTab: (projectId: string, tabId: string) => void
  setUrl: (tabId: string, url: string) => void
  setDeviceMode: (tabId: string, mode: DeviceMode) => void
  addConsoleEntry: (tabId: string, entry: ConsoleEntry) => void
  addNetworkEntry: (tabId: string, entry: NetworkEntry) => void
  setDevToolsTab: (tab: 'console' | 'network' | 'passwords') => void
  clearConsole: (tabId: string) => void
  clearNetwork: (tabId: string) => void
  setZoomLevel: (tabId: string, level: number) => void
  setTitle: (tabId: string, title: string) => void
  reorderTabs: (projectId: string, fromIndex: number, toIndex: number) => void
  loadTabsForProject: (projectId: string) => Promise<void>
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
      zoomLevel: 0,
      consoleEntries: [],
      networkEntries: []
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
    debouncedSave(projectId)
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
    debouncedSave(projectId)
  },

  setActiveTab: (projectId: string, tabId: string) => {
    set((state) => ({
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
    debouncedSave(projectId)
  },

  setUrl: (tabId: string, url: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, url } : t))
    }))
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) debouncedSave(tab.projectId)
  },

  setDeviceMode: (tabId: string, mode: DeviceMode) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, deviceMode: mode } : t))
    }))
    window.api.browser.setDevice(tabId, mode).catch(() => {})
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) debouncedSave(tab.projectId)
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

  setDevToolsTab: (tab: 'console' | 'network' | 'passwords') => set({ devToolsTab: tab }),

  clearConsole: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, consoleEntries: [] } : t))
    }))
  },

  clearNetwork: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, networkEntries: [] } : t))
    }))
  },

  setZoomLevel: (tabId: string, level: number) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, zoomLevel: level } : t))
    }))
  },

  setTitle: (tabId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t))
    }))
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) debouncedSave(tab.projectId)
  },

  reorderTabs: (projectId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      const projectTabs = state.tabs.filter((t) => t.projectId === projectId)
      const otherTabs = state.tabs.filter((t) => t.projectId !== projectId)
      const [moved] = projectTabs.splice(fromIndex, 1)
      projectTabs.splice(toIndex, 0, moved)
      return { tabs: [...otherTabs, ...projectTabs] }
    })
    debouncedSave(projectId)
  },

  loadTabsForProject: async (projectId: string): Promise<void> => {
    const existing = get().tabs.filter((t) => t.projectId === projectId)
    if (existing.length > 0) return

    const { tabs: persisted, activeTabId } = await window.api.browser.loadTabs(projectId)
    if (persisted.length === 0) {
      get().createTab(projectId)
      return
    }

    const hydrated: BrowserTab[] = persisted.map((p) => ({
      id: p.id,
      title: p.title,
      projectId,
      url: p.url,
      deviceMode: p.deviceMode,
      zoomLevel: 0,
      consoleEntries: [],
      networkEntries: []
    }))

    set((state) => ({
      tabs: [...state.tabs, ...hydrated],
      activeTabPerProject: {
        ...state.activeTabPerProject,
        [projectId]: activeTabId || hydrated[0].id
      }
    }))
  }
}))
