import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorktreeInfo, WorktreeMergeResult } from '@/models/types'

interface WorktreeState {
  enabledPerProject: Record<string, boolean>
  preMergeCommandPerProject: Record<string, string>
  worktreesPerTab: Record<string, WorktreeInfo>
  pendingTabs: Record<string, true>
  lastErrorPerTab: Record<string, string>

  isEnabled: (projectId: string) => boolean
  setEnabled: (projectId: string, enabled: boolean) => void
  getPreMergeCommand: (projectId: string) => string
  setPreMergeCommand: (projectId: string, cmd: string) => void

  getInfo: (tabId: string) => WorktreeInfo | undefined
  isPending: (tabId: string) => boolean

  createForTab: (tabId: string, projectRoot: string, label: string) => Promise<WorktreeInfo | null>
  rebindTab: (oldTabId: string, newTabId: string) => Promise<WorktreeInfo | null>
  refresh: (tabId: string, projectRoot: string) => Promise<void>
  removeForTab: (tabId: string, options?: { force?: boolean; deleteBranch?: boolean }) => Promise<void>
  merge: (tabId: string, projectId: string) => Promise<WorktreeMergeResult>
  setReady: (tabId: string, ready: boolean) => Promise<void>
  reconcile: (projectId: string, projectRoot: string) => Promise<void>
}

export const useWorktreeStore = create<WorktreeState>()(
  persist(
    (set, get) => ({
      enabledPerProject: {},
      preMergeCommandPerProject: {},
      worktreesPerTab: {},
      pendingTabs: {},
      lastErrorPerTab: {},

      isEnabled: (projectId: string): boolean => {
        return get().enabledPerProject[projectId] ?? false
      },

      setEnabled: (projectId: string, enabled: boolean): void => {
        set((state) => ({
          enabledPerProject: { ...state.enabledPerProject, [projectId]: enabled }
        }))
      },

      getPreMergeCommand: (projectId: string): string => {
        return get().preMergeCommandPerProject[projectId] ?? ''
      },

      setPreMergeCommand: (projectId: string, cmd: string): void => {
        set((state) => ({
          preMergeCommandPerProject: { ...state.preMergeCommandPerProject, [projectId]: cmd }
        }))
      },

      getInfo: (tabId: string): WorktreeInfo | undefined => {
        return get().worktreesPerTab[tabId]
      },

      isPending: (tabId: string): boolean => {
        return !!get().pendingTabs[tabId]
      },

      createForTab: async (
        tabId: string,
        projectRoot: string,
        label: string
      ): Promise<WorktreeInfo | null> => {
        set((state) => ({ pendingTabs: { ...state.pendingTabs, [tabId]: true } }))
        try {
          const info = await window.api.worktree.create(tabId, projectRoot, label)
          set((state) => {
            const pending = { ...state.pendingTabs }
            delete pending[tabId]
            const errors = { ...state.lastErrorPerTab }
            delete errors[tabId]
            return {
              pendingTabs: pending,
              lastErrorPerTab: errors,
              worktreesPerTab: info
                ? { ...state.worktreesPerTab, [tabId]: info }
                : state.worktreesPerTab
            }
          })
          return info
        } catch (err) {
          set((state) => {
            const pending = { ...state.pendingTabs }
            delete pending[tabId]
            return {
              pendingTabs: pending,
              lastErrorPerTab: { ...state.lastErrorPerTab, [tabId]: String(err) }
            }
          })
          return null
        }
      },

      rebindTab: async (oldTabId: string, newTabId: string): Promise<WorktreeInfo | null> => {
        const old = get().worktreesPerTab[oldTabId]
        if (!old) return null
        const info = await window.api.worktree.rebind(old.projectRoot, oldTabId, newTabId)
        set((state) => {
          const next = { ...state.worktreesPerTab }
          delete next[oldTabId]
          if (info) next[newTabId] = info
          return { worktreesPerTab: next }
        })
        return info
      },

      refresh: async (tabId: string, projectRoot: string): Promise<void> => {
        const info = await window.api.worktree.info(tabId, projectRoot)
        if (!info) return
        set((state) => ({
          worktreesPerTab: { ...state.worktreesPerTab, [tabId]: info }
        }))
      },

      removeForTab: async (
        tabId: string,
        options?: { force?: boolean; deleteBranch?: boolean }
      ): Promise<void> => {
        const info = get().worktreesPerTab[tabId]
        if (!info) return
        await window.api.worktree.remove(tabId, info.projectRoot, options)
        set((state) => {
          const next = { ...state.worktreesPerTab }
          delete next[tabId]
          return { worktreesPerTab: next }
        })
      },

      merge: async (tabId: string, projectId: string): Promise<WorktreeMergeResult> => {
        const info = get().worktreesPerTab[tabId]
        if (!info) return { ok: false, reason: 'No worktree for this tab' }
        const preMergeCommand = get().preMergeCommandPerProject[projectId] ?? ''
        const result = await window.api.worktree.merge(tabId, info.projectRoot, {
          preMergeCommand
        })
        if (result.ok) {
          await get().refresh(tabId, info.projectRoot)
        }
        return result
      },

      setReady: async (tabId: string, ready: boolean): Promise<void> => {
        const info = get().worktreesPerTab[tabId]
        if (!info) return
        await window.api.worktree.setReady(info.projectRoot, tabId, ready)
        set((state) => ({
          worktreesPerTab: {
            ...state.worktreesPerTab,
            [tabId]: { ...info, readyToMerge: ready }
          }
        }))
      },

      reconcile: async (projectId: string, projectRoot: string): Promise<void> => {
        const infos = await window.api.worktree.reconcile(projectRoot)
        set((state) => {
          const next = { ...state.worktreesPerTab }
          for (const [tabId, info] of Object.entries(next)) {
            if (info.projectRoot === projectRoot) delete next[tabId]
          }
          for (const info of infos) next[info.tabId] = info
          const userPref = state.enabledPerProject[projectId]
          const enabled =
            infos.length > 0 && userPref === undefined
              ? { ...state.enabledPerProject, [projectId]: true }
              : state.enabledPerProject
          return { worktreesPerTab: next, enabledPerProject: enabled }
        })
      }
    }),
    {
      name: 'vbcdr-worktrees',
      partialize: (state) => ({
        enabledPerProject: state.enabledPerProject,
        preMergeCommandPerProject: state.preMergeCommandPerProject
      })
    }
  )
)
