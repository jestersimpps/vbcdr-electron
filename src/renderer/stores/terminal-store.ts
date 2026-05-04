import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab } from '@/models/types'
import { useWorktreeStore } from '@/stores/worktree-store'
import { useGitStore } from '@/stores/git-store'

type TabStatus = 'idle' | 'busy'

const OUTPUT_BUFFER_SIZE = 10

function maybeStartWorktree(
  tabId: string,
  projectId: string,
  projectRoot: string,
  initialCommand: string,
  applyCwd: (tabId: string, cwd: string, pending: boolean) => void
): boolean {
  const wt = useWorktreeStore.getState()
  if (!wt.isEnabled(projectId)) return false
  const isRepo = useGitStore.getState().isRepoPerProject[projectId] ?? false
  if (!isRepo) return false

  applyCwd(tabId, projectRoot, true)
  void wt.createForTab(tabId, projectRoot, initialCommand).then((info) => {
    if (info) applyCwd(tabId, info.path, false)
    else applyCwd(tabId, projectRoot, false)
  })
  return true
}

interface TerminalStore {
  tabs: TerminalTab[]
  activeTabPerProject: Record<string, string>
  tabStatuses: Record<string, TabStatus>
  outputBufferPerProject: Record<string, string[]>
  tokenUsagePerTab: Record<string, number>
  lastActivityPerProject: Record<string, number>
  attentionProjectIds: Record<string, boolean>
  focusedTabId: string | null
  createTab: (projectId: string, cwd: string, initialCommand?: string) => string
  closeTab: (tabId: string) => void
  replaceTab: (oldTabId: string, projectId: string, cwd: string, initialCommand?: string) => string
  setActiveTab: (projectId: string, tabId: string) => void
  setTabStatus: (tabId: string, status: TabStatus) => void
  setTabTitle: (tabId: string, title: string) => void
  reorderTabs: (projectId: string, fromIndex: number, toIndex: number) => void
  setOutput: (projectId: string, lines: string[]) => void
  setTokenUsage: (tabId: string, tokens: number) => void
  setFocusedTabId: (tabId: string | null) => void
  markProjectAttention: (projectId: string) => void
  clearProjectAttention: (projectId: string) => void
  initProject: (projectId: string, cwd: string) => Promise<void>
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabPerProject: {},
  tabStatuses: {},
  outputBufferPerProject: {},
  tokenUsagePerTab: {},
  lastActivityPerProject: {},
  attentionProjectIds: {},
  focusedTabId: null,

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
    if (initialCommand) {
      maybeStartWorktree(tabId, projectId, cwd, initialCommand, (id, newCwd, pending) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, cwd: newCwd, pendingWorktree: pending } : t
          )
        }))
      })
    }
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

      const tokenUsagePerTab = { ...state.tokenUsagePerTab }
      delete tokenUsagePerTab[tabId]

      const focusedTabId = state.focusedTabId === tabId ? null : state.focusedTabId

      return { tabs, activeTabPerProject, tabStatuses, tokenUsagePerTab, focusedTabId }
    })

    // Keep on-disk worktree intact (user discards explicitly via the pill);
    // just drop the in-memory mapping so closed tabs don't haunt the UI.
    const wt = useWorktreeStore.getState()
    if (wt.getInfo(tabId)) {
      useWorktreeStore.setState((state) => {
        const next = { ...state.worktreesPerTab }
        delete next[tabId]
        return { worktreesPerTab: next }
      })
    }
  },

  replaceTab: (oldTabId: string, projectId: string, cwd: string, initialCommand?: string) => {
    const newTabId = uuid()
    const oldInfo = useWorktreeStore.getState().getInfo(oldTabId)
    const tab: TerminalTab = {
      id: newTabId,
      title: initialCommand ? 'LLM' : 'Terminal',
      projectId,
      cwd: oldInfo ? oldInfo.path : cwd,
      initialCommand
    }
    set((state) => ({
      tabs: [...state.tabs.filter((t) => t.id !== oldTabId), tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: newTabId }
    }))
    if (oldInfo) {
      void useWorktreeStore.getState().rebindTab(oldTabId, newTabId)
    } else if (initialCommand) {
      maybeStartWorktree(newTabId, projectId, cwd, initialCommand, (id, newCwd, pending) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, cwd: newCwd, pendingWorktree: pending } : t
          )
        }))
      })
    }
    return newTabId
  },

  setTabStatus: (tabId: string, status: TabStatus) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    set((state) => ({
      tabStatuses: { ...state.tabStatuses, [tabId]: status },
      ...(tab && { lastActivityPerProject: { ...state.lastActivityPerProject, [tab.projectId]: Date.now() } })
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

  markProjectAttention: (projectId: string) => {
    set((state) => ({
      attentionProjectIds: { ...state.attentionProjectIds, [projectId]: true }
    }))
  },

  clearProjectAttention: (projectId: string) => {
    const next = { ...get().attentionProjectIds }
    if (!(projectId in next)) return
    delete next[projectId]
    set({ attentionProjectIds: next })
  },

  reorderTabs: (projectId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      if (fromIndex === toIndex) return state
      const projectTabs = state.tabs.filter((t) => t.projectId === projectId)
      if (fromIndex < 0 || fromIndex >= projectTabs.length) return state
      if (toIndex < 0 || toIndex >= projectTabs.length) return state
      const reordered = [...projectTabs]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      const others = state.tabs.filter((t) => t.projectId !== projectId)
      return { tabs: [...others, ...reordered] }
    })
  },

  setOutput: (projectId: string, lines: string[]) => {
    set((state) => ({
      outputBufferPerProject: {
        ...state.outputBufferPerProject,
        [projectId]: lines.slice(-OUTPUT_BUFFER_SIZE)
      },
      lastActivityPerProject: { ...state.lastActivityPerProject, [projectId]: Date.now() }
    }))
  },

  setTokenUsage: (tabId: string, tokens: number) => {
    set((state) => ({
      tokenUsagePerTab: { ...state.tokenUsagePerTab, [tabId]: tokens }
    }))
  },

  setFocusedTabId: (tabId: string | null) => {
    set({ focusedTabId: tabId })
  },

  initProject: async (projectId: string, cwd: string) => {
    const existing = get().tabs.filter((t) => t.projectId === projectId)
    if (existing.length > 0) {
      const liveness = await Promise.all(existing.map((t) => window.api.terminal.has(t.id)))
      const deadIds = existing.filter((_, i) => !liveness[i]).map((t) => t.id)
      const liveCount = existing.length - deadIds.length
      if (deadIds.length > 0) {
        set((state) => {
          const tabs = state.tabs.filter((t) => !deadIds.includes(t.id))
          const activeTabPerProject = { ...state.activeTabPerProject }
          if (deadIds.includes(activeTabPerProject[projectId])) {
            const remainingForProject = tabs.filter((t) => t.projectId === projectId)
            if (remainingForProject.length > 0) {
              activeTabPerProject[projectId] = remainingForProject[remainingForProject.length - 1].id
            } else {
              delete activeTabPerProject[projectId]
            }
          }
          const tabStatuses = { ...state.tabStatuses }
          const tokenUsagePerTab = { ...state.tokenUsagePerTab }
          for (const id of deadIds) {
            delete tabStatuses[id]
            delete tokenUsagePerTab[id]
          }
          return { tabs, activeTabPerProject, tabStatuses, tokenUsagePerTab }
        })
      }
      if (liveCount > 0) return
    }
    get().createTab(projectId, cwd, 'claude')
  }
}))
