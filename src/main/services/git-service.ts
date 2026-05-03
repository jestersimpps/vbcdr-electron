import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import type { GitCommit, GitBranch, GitFileStatus, GitCheckoutResult, GitCommitResult, BranchDriftInfo, ConflictInfo, StatsCommit, LanguageTally } from '@main/models/types'
import { EXT_TO_LANGUAGE } from '@main/services/language-map'

const execFile = promisify(execFileCb)
const SEPARATOR = '<<SEP>>'
const FORMAT = ['%H', '%h', '%s', '%an', '%ar', '%D', '%P'].join(SEPARATOR)

async function runGit(cwd: string, args: string[], timeout: number = 5000, maxBuffer: number = 10 * 1024 * 1024): Promise<string> {
  const { stdout } = await execFile('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout,
    maxBuffer,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'credential.helper',
      GIT_CONFIG_VALUE_0: ''
    }
  })
  return stdout.trim()
}

async function runGitWithAuth(cwd: string, args: string[], timeout: number = 30000, maxBuffer: number = 10 * 1024 * 1024): Promise<string> {
  const { stdout } = await execFile('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout,
    maxBuffer,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0'
    }
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

export async function getFileAtRef(cwd: string, ref: string, absolutePath: string): Promise<string | null> {
  try {
    const relativePath = path.relative(cwd, absolutePath)
    if (relativePath.startsWith('..')) return null
    return await runGit(cwd, ['show', `${ref}:${relativePath}`], 10000, 50 * 1024 * 1024)
  } catch {
    return null
  }
}

export interface CommitChangedFile {
  path: string
  absolutePath: string
  status: GitFileStatus
}

export async function getCommitChangedFiles(cwd: string, hash: string): Promise<CommitChangedFile[]> {
  try {
    const parents = await runGit(cwd, ['rev-list', '--parents', '-n', '1', hash])
    const hasParent = parents.split(' ').length > 1
    const args = hasParent
      ? ['diff', '--name-status', '-M', `${hash}^`, hash]
      : ['diff-tree', '--no-commit-id', '--name-status', '-M', '-r', '--root', hash]
    const raw = await runGit(cwd, args, 15000, 50 * 1024 * 1024)
    if (!raw) return []

    const files: CommitChangedFile[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const code = parts[0][0]
      const filePath = parts[parts.length - 1]
      let status: GitFileStatus = 'modified'
      if (code === 'A') status = 'added'
      else if (code === 'D') status = 'deleted'
      else if (code === 'R') status = 'renamed'
      else if (code === 'M') status = 'modified'
      files.push({
        path: filePath,
        absolutePath: path.join(cwd, filePath),
        status
      })
    }
    return files.sort((a, b) => a.path.localeCompare(b.path))
  } catch {
    return []
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
    return await runGitWithAuth(cwd, ['pull'], 30000)
  } catch (err) {
    return (err as Error).message
  }
}

export async function push(cwd: string): Promise<string> {
  try {
    return await runGitWithAuth(cwd, ['push'], 30000)
  } catch (err) {
    return (err as Error).message
  }
}

export async function rebaseRemote(cwd: string): Promise<string> {
  try {
    return await runGitWithAuth(cwd, ['pull', '--rebase'], 30000)
  } catch (err) {
    return (err as Error).message
  }
}

export async function commitAll(cwd: string, message: string): Promise<GitCommitResult> {
  try {
    await runGit(cwd, ['add', '-A'], 15000)
    await runGit(cwd, ['commit', '-m', message], 15000)
    const hash = await runGit(cwd, ['rev-parse', 'HEAD'])
    return { success: true, hash }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function commitPaths(cwd: string, message: string, absolutePaths: string[]): Promise<GitCommitResult> {
  try {
    if (absolutePaths.length === 0) {
      return { success: false, error: 'No files selected to commit' }
    }
    const relativePaths = absolutePaths.map((p) => path.relative(cwd, p))
    await runGit(cwd, ['reset', '--', '.'], 15000)
    await runGit(cwd, ['add', '--', ...relativePaths], 15000)
    await runGit(cwd, ['commit', '--only', '-m', message, '--', ...relativePaths], 15000)
    const hash = await runGit(cwd, ['rev-parse', 'HEAD'])
    return { success: true, hash }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function getFirstChangedLine(cwd: string, absolutePath: string): Promise<number | null> {
  try {
    const relativePath = path.relative(cwd, absolutePath)
    if (relativePath.startsWith('..')) return null
    const raw = await runGit(cwd, ['diff', '--unified=0', 'HEAD', '--', relativePath])
    if (!raw) {
      const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '--', relativePath])
      return untracked ? 1 : null
    }
    const match = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/m)
    return match ? parseInt(match[1], 10) || 1 : null
  } catch {
    return null
  }
}

const STATS_FORMAT = ['%H', '%at', '%ae', '%an'].join('<<SEP>>')

export async function getCommitsSince(cwd: string, sinceIso: string | null): Promise<StatsCommit[]> {
  try {
    const args = ['log', '--all', `--format=${STATS_FORMAT}`, '--no-merges']
    if (sinceIso) args.push(`--since=${sinceIso}`)
    const raw = await runGit(cwd, args, 15000)
    if (!raw) return []

    return raw.split('\n').map((line) => {
      const [hash, tsRaw, authorEmail, authorName] = line.split('<<SEP>>')
      return {
        hash,
        timestamp: parseInt(tsRaw, 10) * 1000,
        authorEmail: authorEmail ?? '',
        authorName: authorName ?? ''
      }
    })
  } catch {
    return []
  }
}

export async function getUserEmail(cwd: string): Promise<string> {
  try {
    return await runGit(cwd, ['config', 'user.email'])
  } catch {
    return ''
  }
}

async function isTracked(cwd: string, relativePath: string): Promise<boolean> {
  try {
    await execFile('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000
    })
    return true
  } catch {
    return false
  }
}

export async function addToGitignore(cwd: string, absolutePath: string): Promise<GitCommitResult> {
  try {
    const relativePath = path.relative(cwd, absolutePath)
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return { success: false, error: 'Path is outside the project' }
    }

    const entry = relativePath.split(path.sep).join('/')
    const gitignorePath = path.join(cwd, '.gitignore')

    let existing = ''
    try {
      existing = await fs.promises.readFile(gitignorePath, 'utf-8')
    } catch {
      existing = ''
    }

    const lines = existing.split('\n').map((l) => l.trim())
    if (!lines.includes(entry)) {
      const needsNewline = existing.length > 0 && !existing.endsWith('\n')
      const toAppend = (needsNewline ? '\n' : '') + entry + '\n'
      await fs.promises.appendFile(gitignorePath, toAppend, 'utf-8')
    }

    if (await isTracked(cwd, relativePath)) {
      await runGit(cwd, ['rm', '--cached', '--', relativePath])
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function listGitignore(cwd: string): Promise<string[]> {
  try {
    const gitignorePath = path.join(cwd, '.gitignore')
    const content = await fs.promises.readFile(gitignorePath, 'utf-8')
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
  } catch {
    return []
  }
}

export async function removeFromGitignore(cwd: string, entry: string): Promise<GitCommitResult> {
  try {
    const target = entry.trim()
    if (!target) return { success: false, error: 'Empty entry' }

    const gitignorePath = path.join(cwd, '.gitignore')
    let existing = ''
    try {
      existing = await fs.promises.readFile(gitignorePath, 'utf-8')
    } catch {
      return { success: false, error: '.gitignore not found' }
    }

    const endsWithNewline = existing.endsWith('\n')
    const lines = existing.split('\n')
    const filtered = lines.filter((l) => l.trim() !== target)

    if (filtered.length === lines.length) {
      return { success: false, error: 'Entry not found' }
    }

    let next = filtered.join('\n')
    if (endsWithNewline && !next.endsWith('\n')) next += '\n'
    if (!endsWithNewline && next.endsWith('\n')) next = next.slice(0, -1)

    await fs.promises.writeFile(gitignorePath, next, 'utf-8')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function getLanguageTally(cwd: string): Promise<LanguageTally> {
  try {
    const raw = await runGit(cwd, ['ls-files'], 15000, 50 * 1024 * 1024)
    if (!raw) return {}

    const tally: LanguageTally = {}
    for (const file of raw.split('\n')) {
      const dot = file.lastIndexOf('.')
      if (dot < 0 || dot === file.length - 1) continue
      const slash = file.lastIndexOf('/')
      if (dot < slash) continue
      const ext = file.slice(dot + 1).toLowerCase()
      const lang = EXT_TO_LANGUAGE[ext]
      if (!lang) continue
      tally[lang] = (tally[lang] ?? 0) + 1
    }
    return tally
  } catch {
    return {}
  }
}
