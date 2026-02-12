import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab } from '@/models/types'

interface DevTerminalStore {
  tabs: TerminalTab[]
  createTab: (projectId: string, cwd: string) => string
  closeTab: (tabId: string) => void
  initProject: (projectId: string, cwd: string) => void
}

export const useDevTerminalStore = create<DevTerminalStore>((set, get) => ({
  tabs: [],

  createTab: (projectId: string, cwd: string): string => {
    const tabId = uuid()
    const projectTabs = get().tabs.filter((t) => t.projectId === projectId)
    const tab: TerminalTab = {
      id: tabId,
      title: `Dev ${projectTabs.length + 1}`,
      projectId,
      cwd
    }
    set((state) => ({ tabs: [...state.tabs, tab] }))
    return tabId
  },

  closeTab: (tabId: string): void => {
    set((state) => ({ tabs: state.tabs.filter((t) => t.id !== tabId) }))
  },

  initProject: (projectId: string, cwd: string): void => {
    const existing = get().tabs.filter((t) => t.projectId === projectId)
    if (existing.length > 0) return
    const { createTab } = get()
    createTab(projectId, cwd)
  }
}))
