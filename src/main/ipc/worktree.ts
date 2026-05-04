import { ipcMain } from 'electron'
import {
  createWorktree,
  computeInfo,
  removeWorktree,
  attemptMerge,
  setReadyToMerge,
  pruneStaleWorktrees,
  reconcileWorktrees,
  getEntry,
  listWorktrees,
  rebindToTab
} from '@main/services/worktree-manager'
import type { WorktreeInfo, WorktreeMergeResult } from '@main/models/types'

export function registerWorktreeHandlers(): void {
  ipcMain.handle(
    'worktree:create',
    async (_event, tabId: string, projectRoot: string, label: string): Promise<WorktreeInfo | null> => {
      try {
        return await createWorktree(tabId, projectRoot, label)
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    'worktree:info',
    async (_event, tabId: string, projectRoot: string): Promise<WorktreeInfo | null> => {
      try {
        return await computeInfo(tabId, projectRoot)
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    'worktree:remove',
    async (
      _event,
      tabId: string,
      projectRoot: string,
      options?: { force?: boolean; deleteBranch?: boolean }
    ): Promise<void> => {
      await removeWorktree(projectRoot, tabId, options ?? {})
    }
  )

  ipcMain.handle(
    'worktree:merge',
    async (
      _event,
      tabId: string,
      projectRoot: string,
      options?: { preMergeCommand?: string; preMergeTimeoutMs?: number }
    ): Promise<WorktreeMergeResult> => {
      return await attemptMerge(projectRoot, tabId, options ?? {})
    }
  )

  ipcMain.handle(
    'worktree:set-ready',
    (_event, projectRoot: string, tabId: string, ready: boolean): void => {
      setReadyToMerge(projectRoot, tabId, ready)
    }
  )

  ipcMain.handle('worktree:prune', async (_event, projectRoot: string): Promise<void> => {
    await pruneStaleWorktrees(projectRoot)
  })

  ipcMain.handle(
    'worktree:has',
    (_event, tabId: string, projectRoot: string): boolean => {
      return getEntry(projectRoot, tabId) !== null
    }
  )

  ipcMain.handle('worktree:list', (_event, projectRoot: string) => {
    return listWorktrees(projectRoot)
  })

  ipcMain.handle(
    'worktree:reconcile',
    async (_event, projectRoot: string): Promise<WorktreeInfo[]> => {
      try {
        return await reconcileWorktrees(projectRoot)
      } catch {
        return []
      }
    }
  )

  ipcMain.handle(
    'worktree:rebind',
    async (_event, projectRoot: string, oldTabId: string, newTabId: string): Promise<WorktreeInfo | null> => {
      rebindToTab(projectRoot, oldTabId, newTabId)
      try {
        return await computeInfo(newTabId, projectRoot)
      } catch {
        return null
      }
    }
  )
}
