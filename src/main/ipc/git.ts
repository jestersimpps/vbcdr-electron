import { safeHandle } from '@main/ipc/safe-handle'
import {
  isGitRepo,
  getCommits,
  getBranches,
  getStatus,
  getFileAtHead,
  getFileAtRef,
  getFileBytesAtHead,
  getFileBytesAtRef,
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
import type { CommitChangedFile, DiffNumstat, GitFileBytes } from '@main/services/git-service'

export function registerGitHandlers(): void {
  safeHandle('git:is-repo', async (_event, cwd: string): Promise<boolean> => {
    return isGitRepo(cwd)
  })

  safeHandle('git:commits', async (_event, cwd: string, maxCount?: number): Promise<GitCommit[]> => {
    return getCommits(cwd, maxCount)
  })

  safeHandle('git:branches', async (_event, cwd: string): Promise<GitBranch[]> => {
    return getBranches(cwd)
  })

  safeHandle(
    'git:status',
    async (_event, cwd: string): Promise<Record<string, GitFileStatus>> => {
      return getStatus(cwd)
    }
  )

  safeHandle(
    'git:file-at-head',
    async (_event, cwd: string, filePath: string): Promise<string | null> => {
      return getFileAtHead(cwd, filePath)
    }
  )

  safeHandle(
    'git:file-at-ref',
    async (_event, cwd: string, ref: string, filePath: string): Promise<string | null> => {
      return getFileAtRef(cwd, ref, filePath)
    }
  )

  safeHandle(
    'git:file-bytes-at-head',
    async (_event, cwd: string, filePath: string): Promise<GitFileBytes | null> => {
      return getFileBytesAtHead(cwd, filePath)
    }
  )

  safeHandle(
    'git:file-bytes-at-ref',
    async (_event, cwd: string, ref: string, filePath: string): Promise<GitFileBytes | null> => {
      return getFileBytesAtRef(cwd, ref, filePath)
    }
  )

  safeHandle(
    'git:commit-files',
    async (_event, cwd: string, hash: string): Promise<CommitChangedFile[]> => {
      return getCommitChangedFiles(cwd, hash)
    }
  )

  safeHandle(
    'git:diff-numstat',
    async (_event, cwd: string, hash?: string): Promise<Record<string, DiffNumstat>> => {
      return getDiffNumstat(cwd, hash)
    }
  )

  safeHandle(
    'git:range-files',
    async (_event, cwd: string, from: string, to: string): Promise<CommitChangedFile[]> => {
      return getRangeChangedFiles(cwd, from, to)
    }
  )

  safeHandle(
    'git:range-numstat',
    async (_event, cwd: string, from: string, to: string): Promise<Record<string, DiffNumstat>> => {
      return getRangeNumstat(cwd, from, to)
    }
  )

  safeHandle(
    'git:range-file-count',
    async (_event, cwd: string, from: string, to: string): Promise<number> => {
      return getRangeFileCount(cwd, from, to)
    }
  )

  safeHandle(
    'git:range-hashes',
    async (_event, cwd: string, from: string, to: string): Promise<string[]> => {
      return getRangeHashes(cwd, from, to)
    }
  )

  safeHandle(
    'git:commits-file-counts',
    async (_event, cwd: string, hashes: string[]): Promise<Record<string, number>> => {
      return getCommitsFileCounts(cwd, hashes)
    }
  )

  safeHandle(
    'git:checkout',
    async (_event, cwd: string, branch: string): Promise<GitCheckoutResult> => {
      return checkoutBranch(cwd, branch)
    }
  )

  safeHandle('git:default-branch', async (_event, cwd: string): Promise<string> => {
    return getDefaultBranch(cwd)
  })

  safeHandle('git:diff-summary', async (_event, cwd: string, baseBranch: string): Promise<string> => {
    return getDiffSummary(cwd, baseBranch)
  })

  safeHandle('git:register-fetch', (_event, projectId: string, cwd: string): void => {
    registerProject(projectId, cwd)
  })

  safeHandle('git:unregister-fetch', (_event, projectId: string): void => {
    unregisterProject(projectId)
  })

  safeHandle('git:fetch-now', async (_event, cwd: string): Promise<BranchDriftInfo> => {
    return fetchNow(cwd)
  })

  safeHandle('git:pull', async (_event, cwd: string): Promise<string> => {
    return pull(cwd)
  })

  safeHandle('git:push', async (_event, cwd: string): Promise<string> => {
    return push(cwd)
  })

  safeHandle('git:rebase-remote', async (_event, cwd: string): Promise<string> => {
    return rebaseRemote(cwd)
  })

  safeHandle('git:commit-all', async (_event, cwd: string, message: string): Promise<GitCommitResult> => {
    return commitAll(cwd, message)
  })

  safeHandle('git:commit-paths', async (_event, cwd: string, message: string, paths: string[]): Promise<GitCommitResult> => {
    return commitPaths(cwd, message, paths)
  })

  safeHandle('git:first-changed-line', async (_event, cwd: string, filePath: string): Promise<number | null> => {
    return getFirstChangedLine(cwd, filePath)
  })

  safeHandle('git:conflicts', async (_event, cwd: string): Promise<ConflictInfo[]> => {
    return getConflicts(cwd)
  })

  safeHandle('git:commits-since', async (_event, cwd: string, sinceIso: string | null): Promise<StatsCommit[]> => {
    return getCommitsSince(cwd, sinceIso)
  })

  safeHandle('git:user-email', async (_event, cwd: string): Promise<string> => {
    return getUserEmail(cwd)
  })

  safeHandle('git:language-tally', async (_event, cwd: string): Promise<LanguageTally> => {
    return getLanguageTally(cwd)
  })

  safeHandle('git:ignore-path', async (_event, cwd: string, filePath: string): Promise<GitCommitResult> => {
    return addToGitignore(cwd, filePath)
  })

  safeHandle('git:gitignore-list', async (_event, cwd: string): Promise<string[]> => {
    return listGitignore(cwd)
  })

  safeHandle('git:gitignore-remove', async (_event, cwd: string, entry: string): Promise<GitCommitResult> => {
    return removeFromGitignore(cwd, entry)
  })
}
