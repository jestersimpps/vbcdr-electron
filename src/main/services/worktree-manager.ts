import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import type { WorktreeInfo, WorktreeMergeResult, WorktreeState } from '@main/models/types'

const execFile = promisify(execFileCb)

interface StoredEntry {
  tabId: string
  path: string
  branch: string
  baseBranch: string
  autoMerge: boolean
  readyToMerge: boolean
}

interface MappingFile {
  version: 1
  entries: StoredEntry[]
}

const WORKTREE_DIR = '.worktrees'
const MAPPING_REL = path.join('.vbcdr', 'worktrees.json')
const BRANCH_PREFIX = 'vbcdr'

async function runGit(cwd: string, args: string[], timeout: number = 15000): Promise<string> {
  const { stdout } = await execFile('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
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

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

function sanitizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'llm'
}

function mappingPath(projectRoot: string): string {
  return path.join(projectRoot, MAPPING_REL)
}

function readMapping(projectRoot: string): MappingFile {
  try {
    const raw = fs.readFileSync(mappingPath(projectRoot), 'utf-8')
    const parsed = JSON.parse(raw) as MappingFile
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return { version: 1, entries: [] }
    return parsed
  } catch {
    return { version: 1, entries: [] }
  }
}

function writeMapping(projectRoot: string, mapping: MappingFile): void {
  const file = mappingPath(projectRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(mapping, null, 2), 'utf-8')
}

function upsertEntry(projectRoot: string, entry: StoredEntry): void {
  const mapping = readMapping(projectRoot)
  const idx = mapping.entries.findIndex((e) => e.tabId === entry.tabId)
  if (idx === -1) mapping.entries.push(entry)
  else mapping.entries[idx] = entry
  writeMapping(projectRoot, mapping)
}

function removeEntry(projectRoot: string, tabId: string): void {
  const mapping = readMapping(projectRoot)
  const next = mapping.entries.filter((e) => e.tabId !== tabId)
  if (next.length !== mapping.entries.length) {
    writeMapping(projectRoot, { version: 1, entries: next })
  }
}

async function currentBranch(projectRoot: string): Promise<string> {
  return runGit(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
}

export async function createWorktree(
  tabId: string,
  projectRoot: string,
  label: string
): Promise<WorktreeInfo> {
  const baseBranch = await currentBranch(projectRoot)
  const safeLabel = sanitizeLabel(label)
  const suffix = shortId()
  const branch = `${BRANCH_PREFIX}/${safeLabel}-${suffix}`
  const wtPath = path.join(projectRoot, WORKTREE_DIR, `${safeLabel}-${suffix}`)

  await runGit(projectRoot, ['worktree', 'add', '-b', branch, wtPath, baseBranch])

  upsertEntry(projectRoot, {
    tabId,
    path: wtPath,
    branch,
    baseBranch,
    autoMerge: false,
    readyToMerge: false
  })

  return {
    tabId,
    projectRoot,
    path: wtPath,
    branch,
    baseBranch,
    state: 'idle',
    ahead: 0,
    changedFiles: 0,
    readyToMerge: false
  }
}

async function statusCounts(wtPath: string): Promise<{ changed: number; conflicted: boolean }> {
  try {
    const raw = await runGit(wtPath, ['status', '--porcelain=v1'])
    if (!raw) return { changed: 0, conflicted: false }
    const lines = raw.split('\n').filter(Boolean)
    const conflicted = lines.some((l) => /^(UU|AA|DD|U.|.U) /.test(l))
    return { changed: lines.length, conflicted }
  } catch {
    return { changed: 0, conflicted: false }
  }
}

async function aheadCount(wtPath: string, baseBranch: string, branch: string): Promise<number> {
  try {
    const raw = await runGit(wtPath, ['rev-list', '--count', `${baseBranch}..${branch}`])
    return parseInt(raw, 10) || 0
  } catch {
    return 0
  }
}

function deriveState(changed: number, ahead: number, conflicted: boolean): WorktreeState {
  if (conflicted) return 'conflicted'
  if (changed > 0) return 'dirty'
  if (ahead > 0) return 'ahead'
  return 'idle'
}

export async function computeInfo(tabId: string, projectRoot: string): Promise<WorktreeInfo> {
  const mapping = readMapping(projectRoot)
  const entry = mapping.entries.find((e) => e.tabId === tabId)
  if (!entry) throw new Error(`No worktree for tab ${tabId}`)
  if (!fs.existsSync(entry.path)) throw new Error(`Worktree path missing: ${entry.path}`)

  const [{ changed, conflicted }, ahead] = await Promise.all([
    statusCounts(entry.path),
    aheadCount(entry.path, entry.baseBranch, entry.branch)
  ])

  return {
    tabId,
    projectRoot,
    path: entry.path,
    branch: entry.branch,
    baseBranch: entry.baseBranch,
    state: deriveState(changed, ahead, conflicted),
    ahead,
    changedFiles: changed,
    readyToMerge: entry.readyToMerge
  }
}

export function listWorktrees(projectRoot: string): StoredEntry[] {
  return readMapping(projectRoot).entries
}

export function getEntry(projectRoot: string, tabId: string): StoredEntry | null {
  return readMapping(projectRoot).entries.find((e) => e.tabId === tabId) ?? null
}

export function setReadyToMerge(projectRoot: string, tabId: string, ready: boolean): void {
  const entry = getEntry(projectRoot, tabId)
  if (!entry) return
  upsertEntry(projectRoot, { ...entry, readyToMerge: ready })
}

export function rebindToTab(projectRoot: string, oldTabId: string, newTabId: string): WorktreeInfo | null {
  const entry = getEntry(projectRoot, oldTabId)
  if (!entry) return null
  const mapping = readMapping(projectRoot)
  const next = mapping.entries.filter((e) => e.tabId !== oldTabId)
  next.push({ ...entry, tabId: newTabId })
  writeMapping(projectRoot, { version: 1, entries: next })
  return null
}

export async function removeWorktree(
  projectRoot: string,
  tabId: string,
  options: { force?: boolean; deleteBranch?: boolean } = {}
): Promise<void> {
  const entry = getEntry(projectRoot, tabId)
  if (!entry) return
  const { force = false, deleteBranch = true } = options

  try {
    const args = ['worktree', 'remove']
    if (force) args.push('--force')
    args.push(entry.path)
    await runGit(projectRoot, args)
  } catch {
    if (fs.existsSync(entry.path)) fs.rmSync(entry.path, { recursive: true, force: true })
  }

  if (deleteBranch) {
    try {
      await runGit(projectRoot, ['branch', force ? '-D' : '-d', entry.branch])
    } catch {
      // branch may already be gone
    }
  }

  removeEntry(projectRoot, tabId)
}

export async function pruneStaleWorktrees(projectRoot: string): Promise<void> {
  try {
    await runGit(projectRoot, ['worktree', 'prune'])
  } catch {
    // ignore
  }
  const mapping = readMapping(projectRoot)
  const surviving = mapping.entries.filter((e) => fs.existsSync(e.path))
  if (surviving.length !== mapping.entries.length) {
    writeMapping(projectRoot, { version: 1, entries: surviving })
  }
}

export async function attemptMerge(
  projectRoot: string,
  tabId: string,
  options: { preMergeCommand?: string; preMergeTimeoutMs?: number } = {}
): Promise<WorktreeMergeResult> {
  const entry = getEntry(projectRoot, tabId)
  if (!entry) return { ok: false, reason: 'No worktree for this tab' }

  try {
    await runGit(entry.path, ['diff', '--check'])
  } catch (err) {
    return { ok: false, reason: 'Conflict markers found in worktree', output: String(err) }
  }

  const rootDirty = (await statusCounts(projectRoot)).changed > 0
  if (rootDirty) {
    return {
      ok: false,
      reason: 'Project root has uncommitted changes, commit or stash before merging.'
    }
  }

  const { preMergeCommand, preMergeTimeoutMs = 120000 } = options
  if (preMergeCommand && preMergeCommand.trim().length > 0) {
    try {
      const { stdout, stderr } = await execFile('sh', ['-c', preMergeCommand], {
        cwd: entry.path,
        encoding: 'utf-8',
        timeout: preMergeTimeoutMs,
        maxBuffer: 10 * 1024 * 1024
      })
      void stdout
      void stderr
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string }
      return {
        ok: false,
        reason: 'Pre-merge command failed',
        output: (e.stderr || e.stdout || e.message || 'unknown error').toString()
      }
    }
  }

  let originalBranch: string
  try {
    originalBranch = await currentBranch(projectRoot)
  } catch (err) {
    return { ok: false, reason: 'Could not read current branch', output: String(err) }
  }

  const restore = async (): Promise<void> => {
    if (originalBranch !== entry.baseBranch) {
      try { await runGit(projectRoot, ['checkout', originalBranch]) } catch { /* best effort */ }
    }
  }

  if (originalBranch !== entry.baseBranch) {
    try {
      await runGit(projectRoot, ['checkout', entry.baseBranch])
    } catch (err) {
      return { ok: false, reason: `Could not switch to ${entry.baseBranch}`, output: String(err) }
    }
  }

  try {
    await runGit(projectRoot, ['merge', '--no-ff', '-m', `merge: ${entry.branch}`, entry.branch], 60000)
  } catch (err) {
    try { await runGit(projectRoot, ['merge', '--abort']) } catch { /* may not be in merge state */ }
    await restore()
    return { ok: false, reason: 'Merge failed', output: String(err) }
  }

  await restore()
  upsertEntry(projectRoot, { ...entry, readyToMerge: false })
  return { ok: true }
}
