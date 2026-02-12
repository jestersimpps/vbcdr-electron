import { execFileSync } from 'child_process'
import path from 'path'
import type { GitCommit, GitBranch, GitFileStatus } from '@main/models/types'

const SEPARATOR = '<<SEP>>'
const FORMAT = ['%H', '%h', '%s', '%an', '%ar', '%D', '%P'].join(SEPARATOR)

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 5000 }).trim()
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
    const raw = runGit(cwd, ['branch', '--no-color'])
    if (!raw) return []

    return raw.split('\n').map((line) => ({
      name: line.replace(/^\*?\s+/, ''),
      current: line.startsWith('*')
    }))
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
