import { ipcMain } from 'electron'
import {
  isGitRepo,
  getCommits,
  getBranches,
  getStatus,
  getFileAtHead,
  checkoutBranch,
  getDefaultBranch,
  getDiffSummary,
  getConflicts,
  pull,
  rebaseRemote
} from '@main/services/git-service'
import { registerProject, unregisterProject, fetchNow } from '@main/services/git-fetch-service'
import type { GitCommit, GitBranch, GitFileStatus, GitCheckoutResult, BranchDriftInfo, ConflictInfo } from '@main/models/types'

export function registerGitHandlers(): void {
  ipcMain.handle('git:is-repo', (_event, cwd: string): boolean => {
    return isGitRepo(cwd)
  })

  ipcMain.handle('git:commits', (_event, cwd: string, maxCount?: number): GitCommit[] => {
    return getCommits(cwd, maxCount)
  })

  ipcMain.handle('git:branches', (_event, cwd: string): GitBranch[] => {
    return getBranches(cwd)
  })

  ipcMain.handle(
    'git:status',
    (_event, cwd: string): Record<string, GitFileStatus> => {
      return getStatus(cwd)
    }
  )

  ipcMain.handle(
    'git:file-at-head',
    (_event, cwd: string, filePath: string): string | null => {
      return getFileAtHead(cwd, filePath)
    }
  )

  ipcMain.handle(
    'git:checkout',
    (_event, cwd: string, branch: string): GitCheckoutResult => {
      return checkoutBranch(cwd, branch)
    }
  )

  ipcMain.handle('git:default-branch', (_event, cwd: string): string => {
    return getDefaultBranch(cwd)
  })

  ipcMain.handle('git:diff-summary', (_event, cwd: string, baseBranch: string): string => {
    return getDiffSummary(cwd, baseBranch)
  })

  ipcMain.handle('git:register-fetch', (_event, projectId: string, cwd: string): void => {
    registerProject(projectId, cwd)
  })

  ipcMain.handle('git:unregister-fetch', (_event, projectId: string): void => {
    unregisterProject(projectId)
  })

  ipcMain.handle('git:fetch-now', (_event, cwd: string): BranchDriftInfo => {
    return fetchNow(cwd)
  })

  ipcMain.handle('git:pull', (_event, cwd: string): string => {
    return pull(cwd)
  })

  ipcMain.handle('git:rebase-remote', (_event, cwd: string): string => {
    return rebaseRemote(cwd)
  })

  ipcMain.handle('git:conflicts', (_event, cwd: string): ConflictInfo[] => {
    return getConflicts(cwd)
  })
}
