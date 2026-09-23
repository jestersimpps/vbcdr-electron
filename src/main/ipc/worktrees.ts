import { shell } from 'electron'
import { safeHandle } from '@main/ipc/safe-handle'
import {
  listWorktrees,
  createTrackedWorktree,
  renameTrackedBranch,
  setWorktreeLabel,
  refreshWorktree,
  refreshProjectWorktrees,
  untrackWorktree,
  removeTrackedWorktree,
  finishTrackedWorktree
} from '@main/services/worktree-service'
import { getGhStatus } from '@main/services/gh-service'
import type { CreateWorktreeOptions, GhStatus, GitOpResult, TrackedWorktree } from '@main/models/types'

export function registerWorktreeHandlers(): void {
  safeHandle('worktrees:list', (_event, projectId?: string): TrackedWorktree[] => {
    return listWorktrees(projectId)
  })

  safeHandle(
    'worktrees:create',
    async (_event, projectId: string, projectPath: string, options?: CreateWorktreeOptions): Promise<TrackedWorktree> => {
      return createTrackedWorktree(projectId, projectPath, options)
    }
  )

  safeHandle('worktrees:rename-branch', async (_event, id: string, newBranch: string): Promise<GitOpResult> => {
    return renameTrackedBranch(id, newBranch)
  })

  safeHandle('worktrees:set-label', (_event, id: string, label: string): TrackedWorktree | null => {
    return setWorktreeLabel(id, label)
  })

  safeHandle('worktrees:refresh', async (_event, id: string): Promise<TrackedWorktree | null> => {
    return refreshWorktree(id)
  })

  safeHandle('worktrees:refresh-project', async (_event, projectId: string): Promise<TrackedWorktree[]> => {
    return refreshProjectWorktrees(projectId)
  })

  safeHandle('worktrees:untrack', (_event, id: string): void => {
    untrackWorktree(id)
  })

  safeHandle('worktrees:remove', async (_event, id: string): Promise<GitOpResult> => {
    return removeTrackedWorktree(id)
  })

  safeHandle('worktrees:finish', async (_event, id: string, commitMessage: string): Promise<GitOpResult> => {
    return finishTrackedWorktree(id, commitMessage)
  })

  safeHandle('worktrees:gh-status', async (): Promise<GhStatus> => {
    return getGhStatus()
  })

  safeHandle('worktrees:open-url', async (_event, url: string): Promise<void> => {
    if (!/^https?:\/\//.test(url)) return
    await shell.openExternal(url)
  })
}
