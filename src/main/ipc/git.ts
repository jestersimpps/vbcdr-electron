import { ipcMain } from 'electron'
import {
  isGitRepo,
  getCommits,
  getBranches,
  getStatus,
  getFileAtHead,
  getFileAtRef,
  getCommitChangedFiles,
  getDiffNumstat,
  getRangeChangedFiles,
  getRangeNumstat,
  getRangeFileCount,
  getRangeHashes,
  getCommitsFileCounts,
  checkoutBranch,
  getDefaultBranch,
  getDiffSummary,
  getConflicts,
  pull,
  push,
  rebaseRemote,
  commitAll,
  commitPaths,
  getFirstChangedLine,
  getCommitsSince,
  getUserEmail,
  getLanguageTally,
  addToGitignore,
  listGitignore,
  removeFromGitignore
} from '@main/services/git-service'
import { registerProject, unregisterProject, fetchNow } from '@main/services/git-fetch-service'
import type { GitCommit, GitBranch, GitFileStatus, GitCheckoutResult, GitCommitResult, BranchDriftInfo, ConflictInfo, StatsCommit, LanguageTally } from '@main/models/types'
import type { CommitChangedFile, DiffNumstat } from '@main/services/git-service'

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
    'git:file-at-ref',
    async (_event, cwd: string, ref: string, filePath: string): Promise<string | null> => {
      return getFileAtRef(cwd, ref, filePath)
    }
  )

  ipcMain.handle(
    'git:commit-files',
    async (_event, cwd: string, hash: string): Promise<CommitChangedFile[]> => {
      return getCommitChangedFiles(cwd, hash)
    }
  )

  ipcMain.handle(
    'git:diff-numstat',
    async (_event, cwd: string, hash?: string): Promise<Record<string, DiffNumstat>> => {
      return getDiffNumstat(cwd, hash)
    }
  )

  ipcMain.handle(
    'git:range-files',
    async (_event, cwd: string, from: string, to: string): Promise<CommitChangedFile[]> => {
      return getRangeChangedFiles(cwd, from, to)
    }
  )

  ipcMain.handle(
    'git:range-numstat',
    async (_event, cwd: string, from: string, to: string): Promise<Record<string, DiffNumstat>> => {
      return getRangeNumstat(cwd, from, to)
    }
  )

  ipcMain.handle(
    'git:range-file-count',
    async (_event, cwd: string, from: string, to: string): Promise<number> => {
      return getRangeFileCount(cwd, from, to)
    }
  )

  ipcMain.handle(
    'git:range-hashes',
    async (_event, cwd: string, from: string, to: string): Promise<string[]> => {
      return getRangeHashes(cwd, from, to)
    }
  )

  ipcMain.handle(
    'git:commits-file-counts',
    async (_event, cwd: string, hashes: string[]): Promise<Record<string, number>> => {
      return getCommitsFileCounts(cwd, hashes)
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

  ipcMain.handle('git:push', async (_event, cwd: string): Promise<string> => {
    return push(cwd)
  })

  ipcMain.handle('git:rebase-remote', async (_event, cwd: string): Promise<string> => {
    return rebaseRemote(cwd)
  })

  ipcMain.handle('git:commit-all', async (_event, cwd: string, message: string): Promise<GitCommitResult> => {
    return commitAll(cwd, message)
  })

  ipcMain.handle('git:commit-paths', async (_event, cwd: string, message: string, paths: string[]): Promise<GitCommitResult> => {
    return commitPaths(cwd, message, paths)
  })

  ipcMain.handle('git:first-changed-line', async (_event, cwd: string, filePath: string): Promise<number | null> => {
    return getFirstChangedLine(cwd, filePath)
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

  ipcMain.handle('git:ignore-path', async (_event, cwd: string, filePath: string): Promise<GitCommitResult> => {
    return addToGitignore(cwd, filePath)
  })

  ipcMain.handle('git:gitignore-list', async (_event, cwd: string): Promise<string[]> => {
    return listGitignore(cwd)
  })

  ipcMain.handle('git:gitignore-remove', async (_event, cwd: string, entry: string): Promise<GitCommitResult> => {
    return removeFromGitignore(cwd, entry)
  })
}
