import { execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { GitCommit, GitBranch, GitFileStatus, GitCheckoutResult, BranchDriftInfo, ConflictInfo } from '@main/models/types'

const SEPARATOR = '<<SEP>>'
const FORMAT = ['%H', '%h', '%s', '%an', '%ar', '%D', '%P'].join(SEPARATOR)

function runGit(cwd: string, args: string[], timeout: number = 5000): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout }).trim()
}

export function isGitRepo(cwd: string): boolean {
  try {
    runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

export function getCommits(cwd: string, maxCount: number = 50): GitCommit[] {
  try {
    const safeMax = Math.max(1, Math.min(Math.floor(maxCount), 1000))
    const raw = runGit(cwd, ['log', '--all', `--format=${FORMAT}`, `--max-count=${safeMax}`])
    if (!raw) return []

    return raw.split('\n').map((line) => {
      const [hash, shortHash, message, author, date, refsRaw, parentsRaw] = line.split(SEPARATOR)
      const refs = refsRaw ? refsRaw.split(', ').filter(Boolean) : []
      const parents = parentsRaw ? parentsRaw.split(' ').filter(Boolean) : []
      return { hash, shortHash, message, author, date, refs, parents }
    })
  } catch {
    return []
  }
}

export function getBranches(cwd: string): GitBranch[] {
  try {
    const raw = runGit(cwd, ['branch', '-a', '--no-color'])
    if (!raw) return []

    return raw
      .split('\n')
      .filter((line) => !line.includes('HEAD ->'))
      .map((line) => {
        const current = line.startsWith('*')
        const name = line.replace(/^\*?\s+/, '').trim()
        const isRemote = name.startsWith('remotes/')
        const displayName = isRemote ? name.replace(/^remotes\//, '') : name
        return { name: displayName, current, remote: isRemote }
      })
  } catch {
    return []
  }
}

const STATUS_PRIORITY: Record<GitFileStatus, number> = {
  untracked: 0,
  added: 1,
  renamed: 2,
  modified: 3,
  deleted: 4,
  conflict: 5
}

function parseFileStatus(x: string, y: string): GitFileStatus {
  if (x === '?' && y === '?') return 'untracked'
  if (x === 'U' || y === 'U' || (x === 'D' && y === 'D') || (x === 'A' && y === 'A'))
    return 'conflict'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'R' || y === 'R') return 'renamed'
  if (x === 'A') return 'added'
  return 'modified'
}

export function getFileAtHead(cwd: string, absolutePath: string): string | null {
  try {
    const relativePath = path.relative(cwd, absolutePath)
    if (relativePath.startsWith('..')) return null
    return runGit(cwd, ['show', `HEAD:${relativePath}`])
  } catch {
    return null
  }
}

export function getStatus(cwd: string): Record<string, GitFileStatus> {
  try {
    const raw = runGit(cwd, ['status', '--porcelain'])
    if (!raw) return {}

    const statusMap: Record<string, GitFileStatus> = {}

    for (const line of raw.split('\n')) {
      if (line.length < 4) continue

      const x = line[0]
      const y = line[1]
      const filePath = line.slice(3).split(' -> ').pop()!
      const status = parseFileStatus(x, y)

      const absPath = path.join(cwd, filePath)
      statusMap[absPath] = status

      let dir = path.dirname(absPath)
      while (dir !== cwd && dir.startsWith(cwd)) {
        const existing = statusMap[dir]
        if (!existing || STATUS_PRIORITY[status] > STATUS_PRIORITY[existing]) {
          statusMap[dir] = status
        }
        dir = path.dirname(dir)
      }
    }

    return statusMap
  } catch {
    return {}
  }
}

function isDirty(cwd: string): boolean {
  try {
    const raw = runGit(cwd, ['status', '--porcelain'])
    return raw.length > 0
  } catch {
    return false
  }
}

export function checkoutBranch(cwd: string, branchName: string): GitCheckoutResult {
  let stashed = false
  try {
    if (isDirty(cwd)) {
      runGit(cwd, ['stash', 'push', '-m', 'vbcdr-auto-stash'])
      stashed = true
    }

    const isRemote = branchName.includes('/')
    if (isRemote) {
      const localName = branchName.replace(/^[^/]+\//, '')
      try {
        runGit(cwd, ['checkout', localName])
      } catch {
        runGit(cwd, ['checkout', '-b', localName, '--track', `remotes/${branchName}`])
      }
    } else {
      runGit(cwd, ['checkout', branchName])
    }

    if (stashed) {
      try {
        runGit(cwd, ['stash', 'pop'])
      } catch {
        // stash pop conflict — leave stash, user can resolve
      }
    }

    return { success: true, branch: branchName, stashed }
  } catch (err) {
    if (stashed) {
      try { runGit(cwd, ['stash', 'pop']) } catch {}
    }
    return { success: false, branch: branchName, stashed, error: (err as Error).message }
  }
}

export function getDefaultBranch(cwd: string): string {
  try {
    const ref = runGit(cwd, ['symbolic-ref', 'refs/remotes/origin/HEAD'])
    return ref.replace('refs/remotes/origin/', '')
  } catch {
    try {
      runGit(cwd, ['rev-parse', '--verify', 'refs/heads/main'])
      return 'main'
    } catch {
      return 'master'
    }
  }
}

export function getDiffSummary(cwd: string, baseBranch: string): string {
  try {
    const currentBranch = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const log = runGit(cwd, ['log', '--oneline', `${baseBranch}..${currentBranch}`])
    const stat = runGit(cwd, ['diff', '--stat', `${baseBranch}...${currentBranch}`])
    return `Commits:\n${log}\n\nChanges:\n${stat}`
  } catch (err) {
    return `Error getting diff summary: ${(err as Error).message}`
  }
}

export function fetchRemote(cwd: string): void {
  try {
    const lockPath = path.join(cwd, '.git', 'index.lock')
    if (fs.existsSync(lockPath)) return
    runGit(cwd, ['fetch', '--quiet'], 15000)
  } catch {
    // silent fail for background fetch
  }
}

export function getBranchDrift(cwd: string): BranchDriftInfo {
  try {
    const branch = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const upstream = runGit(cwd, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])
    const raw = runGit(cwd, ['rev-list', '--left-right', '--count', `${branch}...${upstream}`])
    const [aheadStr, behindStr] = raw.split(/\s+/)
    const ahead = parseInt(aheadStr, 10) || 0
    const behind = parseInt(behindStr, 10) || 0
    return { ahead, behind, diverged: ahead > 0 && behind > 0, remoteBranch: upstream }
  } catch {
    return { ahead: 0, behind: 0, diverged: false, remoteBranch: null }
  }
}

export function getConflicts(cwd: string): ConflictInfo[] {
  try {
    const raw = runGit(cwd, ['status', '--porcelain'])
    if (!raw) return []

    return raw
      .split('\n')
      .filter((line) => {
        if (line.length < 4) return false
        const x = line[0]
        const y = line[1]
        return x === 'U' || y === 'U' || (x === 'D' && y === 'D') || (x === 'A' && y === 'A')
      })
      .map((line) => {
        const filePath = line.slice(3).split(' -> ').pop()!
        return { path: filePath, absolutePath: path.join(cwd, filePath) }
      })
  } catch {
    return []
  }
}

export function pull(cwd: string): string {
  try {
    return runGit(cwd, ['pull'], 15000)
  } catch (err) {
    return (err as Error).message
  }
}

export function rebaseRemote(cwd: string): string {
  try {
    return runGit(cwd, ['pull', '--rebase'], 15000)
  } catch (err) {
    return (err as Error).message
  }
}
