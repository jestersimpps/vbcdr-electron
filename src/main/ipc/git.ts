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
  rebaseRemote,
  getCommitsSince,
  getUserEmail,
  getLanguageTally
} from '@main/services/git-service'
import { registerProject, unregisterProject, fetchNow } from '@main/services/git-fetch-service'
import type { GitCommit, GitBranch, GitFileStatus, GitCheckoutResult, BranchDriftInfo, ConflictInfo, StatsCommit, LanguageTally } from '@main/models/types'

export function registerGitHandlers(): void {
  ipcMain.handle('git:is-repo', async (_event, cwd: string): Promise<boolean> => {
    return isGitRepo(cwd)
  })

  ipcMain.handle('git:commits', async (_event, cwd: string, maxCount?: number): Promise<GitCommit[]> => {
    return getCommits(cwd, maxCount)
  })

  ipcMain.handle('git:branches', async (_event, cwd: string): Promise<GitBranch[]> => {
    return getBranches(cwd)
  })

  ipcMain.handle(
    'git:status',
    async (_event, cwd: string): Promise<Record<string, GitFileStatus>> => {
      return getStatus(cwd)
    }
  )

  ipcMain.handle(
    'git:file-at-head',
    async (_event, cwd: string, filePath: string): Promise<string | null> => {
      return getFileAtHead(cwd, filePath)
    }
  )

  ipcMain.handle(
    'git:checkout',
    async (_event, cwd: string, branch: string): Promise<GitCheckoutResult> => {
      return checkoutBranch(cwd, branch)
    }
  )

  ipcMain.handle('git:default-branch', async (_event, cwd: string): Promise<string> => {
    return getDefaultBranch(cwd)
  })

  ipcMain.handle('git:diff-summary', async (_event, cwd: string, baseBranch: string): Promise<string> => {
    return getDiffSummary(cwd, baseBranch)
  })

  ipcMain.handle('git:register-fetch', (_event, projectId: string, cwd: string): void => {
    registerProject(projectId, cwd)
  })

  ipcMain.handle('git:unregister-fetch', (_event, projectId: string): void => {
    unregisterProject(projectId)
  })

  ipcMain.handle('git:fetch-now', async (_event, cwd: string): Promise<BranchDriftInfo> => {
    return fetchNow(cwd)
  })

  ipcMain.handle('git:pull', async (_event, cwd: string): Promise<string> => {
    return pull(cwd)
  })

  ipcMain.handle('git:rebase-remote', async (_event, cwd: string): Promise<string> => {
    return rebaseRemote(cwd)
  })

  ipcMain.handle('git:conflicts', async (_event, cwd: string): Promise<ConflictInfo[]> => {
    return getConflicts(cwd)
  })

  ipcMain.handle('git:commits-since', async (_event, cwd: string, sinceIso: string | null): Promise<StatsCommit[]> => {
    return getCommitsSince(cwd, sinceIso)
  })

  ipcMain.handle('git:user-email', async (_event, cwd: string): Promise<string> => {
    return getUserEmail(cwd)
  })

  ipcMain.handle('git:language-tally', async (_event, cwd: string): Promise<LanguageTally> => {
    return getLanguageTally(cwd)
  })
}
