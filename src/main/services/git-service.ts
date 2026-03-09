import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import type { GitCommit, GitBranch, GitFileStatus, GitCheckoutResult, BranchDriftInfo, ConflictInfo } from '@main/models/types'

const execFile = promisify(execFileCb)
const SEPARATOR = '<<SEP>>'
const FORMAT = ['%H', '%h', '%s', '%an', '%ar', '%D', '%P'].join(SEPARATOR)

async function runGit(cwd: string, args: string[], timeout: number = 5000): Promise<string> {
  const { stdout } = await execFile('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
  return stdout.trim()
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

export async function getCommits(cwd: string, maxCount: number = 50): Promise<GitCommit[]> {
  try {
    const safeMax = Math.max(1, Math.min(Math.floor(maxCount), 1000))
    const raw = await runGit(cwd, ['log', '--all', `--format=${FORMAT}`, `--max-count=${safeMax}`])
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

export async function getBranches(cwd: string): Promise<GitBranch[]> {
  try {
    const raw = await runGit(cwd, ['branch', '-a', '--no-color'])
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

export async function getFileAtHead(cwd: string, absolutePath: string): Promise<string | null> {
  try {
    const relativePath = path.relative(cwd, absolutePath)
    if (relativePath.startsWith('..')) return null
    return await runGit(cwd, ['show', `HEAD:${relativePath}`])
  } catch {
    return null
  }
}

export async function getStatus(cwd: string): Promise<Record<string, GitFileStatus>> {
  try {
    const raw = await runGit(cwd, ['status', '--porcelain'])
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

async function isDirty(cwd: string): Promise<boolean> {
  try {
    const raw = await runGit(cwd, ['status', '--porcelain'])
    return raw.length > 0
  } catch {
    return false
  }
}

export async function checkoutBranch(cwd: string, branchName: string): Promise<GitCheckoutResult> {
  let stashed = false
  try {
    if (await isDirty(cwd)) {
      await runGit(cwd, ['stash', 'push', '-m', 'vbcdr-auto-stash'])
      stashed = true
    }

    const isRemote = branchName.includes('/')
    if (isRemote) {
      const localName = branchName.replace(/^[^/]+\//, '')
      try {
        await runGit(cwd, ['checkout', localName])
      } catch {
        await runGit(cwd, ['checkout', '-b', localName, '--track', `remotes/${branchName}`])
      }
    } else {
      await runGit(cwd, ['checkout', branchName])
    }

    if (stashed) {
      try {
        await runGit(cwd, ['stash', 'pop'])
      } catch {
        // stash pop conflict — leave stash, user can resolve
      }
    }

    return { success: true, branch: branchName, stashed }
  } catch (err) {
    if (stashed) {
      try { await runGit(cwd, ['stash', 'pop']) } catch {}
    }
    return { success: false, branch: branchName, stashed, error: (err as Error).message }
  }
}

export async function getDefaultBranch(cwd: string): Promise<string> {
  try {
    const ref = await runGit(cwd, ['symbolic-ref', 'refs/remotes/origin/HEAD'])
    return ref.replace('refs/remotes/origin/', '')
  } catch {
    try {
      await runGit(cwd, ['rev-parse', '--verify', 'refs/heads/main'])
      return 'main'
    } catch {
      return 'master'
    }
  }
}

export async function getDiffSummary(cwd: string, baseBranch: string): Promise<string> {
  try {
    const currentBranch = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const log = await runGit(cwd, ['log', '--oneline', `${baseBranch}..${currentBranch}`])
    const stat = await runGit(cwd, ['diff', '--stat', `${baseBranch}...${currentBranch}`])
    return `Commits:\n${log}\n\nChanges:\n${stat}`
  } catch (err) {
    return `Error getting diff summary: ${(err as Error).message}`
  }
}

export async function fetchRemote(cwd: string): Promise<void> {
  try {
    const lockPath = path.join(cwd, '.git', 'index.lock')
    if (fs.existsSync(lockPath)) return
    await runGit(cwd, ['fetch', '--quiet'], 15000)
  } catch {
    // silent fail for background fetch
  }
}

export async function getBranchDrift(cwd: string): Promise<BranchDriftInfo> {
  try {
    const branch = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const upstream = await runGit(cwd, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])
    const raw = await runGit(cwd, ['rev-list', '--left-right', '--count', `${branch}...${upstream}`])
    const [aheadStr, behindStr] = raw.split(/\s+/)
    const ahead = parseInt(aheadStr, 10) || 0
    const behind = parseInt(behindStr, 10) || 0
    return { ahead, behind, diverged: ahead > 0 && behind > 0, remoteBranch: upstream }
  } catch {
    return { ahead: 0, behind: 0, diverged: false, remoteBranch: null }
  }
}

export async function getConflicts(cwd: string): Promise<ConflictInfo[]> {
  try {
    const raw = await runGit(cwd, ['status', '--porcelain'])
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

export async function pull(cwd: string): Promise<string> {
  try {
    return await runGit(cwd, ['pull'], 15000)
  } catch (err) {
    return (err as Error).message
  }
}

export async function rebaseRemote(cwd: string): Promise<string> {
  try {
    return await runGit(cwd, ['pull', '--rebase'], 15000)
  } catch (err) {
    return (err as Error).message
  }
}
