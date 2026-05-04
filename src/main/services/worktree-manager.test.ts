import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

interface ExecCall { cmd: string; args: string[]; cwd?: string }
const calls: ExecCall[] = []
let nextOutputs: Array<string | Error> = []

vi.mock('child_process', () => {
  const handler = (
    cmd: string,
    args: string[],
    opts: { cwd?: string },
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
  ): void => {
    calls.push({ cmd, args, cwd: opts?.cwd })
    const out = nextOutputs.shift()
    if (out instanceof Error) {
      cb(out, { stdout: '', stderr: '' })
    } else {
      cb(null, { stdout: out ?? '', stderr: '' })
    }
  }
  return { default: { execFile: handler }, execFile: handler }
})

const setOutputs = (...outs: Array<string | Error>): void => {
  nextOutputs = outs
}

let mod: typeof import('./worktree-manager')
let tmpRoot: string

beforeEach(async () => {
  calls.length = 0
  nextOutputs = []
  vi.resetModules()
  mod = await import('./worktree-manager')
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-mgr-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const mappingFile = (): string => path.join(tmpRoot, '.vbcdr', 'worktrees.json')

const seedEntry = (entry: {
  tabId: string
  pathRel: string
  branch: string
  baseBranch: string
  autoMerge?: boolean
  readyToMerge?: boolean
}): string => {
  const wtPath = path.join(tmpRoot, entry.pathRel)
  fs.mkdirSync(wtPath, { recursive: true })
  fs.mkdirSync(path.dirname(mappingFile()), { recursive: true })
  fs.writeFileSync(
    mappingFile(),
    JSON.stringify({
      version: 1,
      entries: [{
        tabId: entry.tabId,
        path: wtPath,
        branch: entry.branch,
        baseBranch: entry.baseBranch,
        autoMerge: entry.autoMerge ?? false,
        readyToMerge: entry.readyToMerge ?? false
      }]
    })
  )
  return wtPath
}

describe('createWorktree', () => {
  it('runs git worktree add and persists mapping', async () => {
    setOutputs('master', '')
    const info = await mod.createWorktree('tab-1', tmpRoot, 'claude')

    expect(calls[0].args).toEqual(['rev-parse', '--abbrev-ref', 'HEAD'])
    expect(calls[1].args[0]).toBe('worktree')
    expect(calls[1].args[1]).toBe('add')
    expect(calls[1].args).toContain('-b')
    expect(info.branch).toMatch(/^vbcdr\/claude-/)
    expect(info.baseBranch).toBe('master')

    const stored = JSON.parse(fs.readFileSync(mappingFile(), 'utf-8'))
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0].tabId).toBe('tab-1')
  })

  it('sanitizes labels with non-alphanumeric chars', async () => {
    setOutputs('main', '')
    const info = await mod.createWorktree('tab-1', tmpRoot, 'Claude Code!')
    expect(info.branch).toMatch(/^vbcdr\/claude-code-/)
  })

  it('falls back to "llm" for empty labels', async () => {
    setOutputs('main', '')
    const info = await mod.createWorktree('tab-1', tmpRoot, '!!!')
    expect(info.branch).toMatch(/^vbcdr\/llm-/)
  })
})

describe('computeInfo', () => {
  it('returns idle state when clean and not ahead', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs('', '0')
    const info = await mod.computeInfo('t1', tmpRoot)
    expect(info.state).toBe('idle')
    expect(info.changedFiles).toBe(0)
    expect(info.ahead).toBe(0)
  })

  it('returns dirty when status has changes', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs(' M src/a.ts\n?? src/b.ts', '0')
    const info = await mod.computeInfo('t1', tmpRoot)
    expect(info.state).toBe('dirty')
    expect(info.changedFiles).toBe(2)
  })

  it('returns ahead when clean but commits exist beyond base', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs('', '3')
    const info = await mod.computeInfo('t1', tmpRoot)
    expect(info.state).toBe('ahead')
    expect(info.ahead).toBe(3)
  })

  it('returns conflicted when status has UU/AA markers', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs('UU src/a.ts', '0')
    const info = await mod.computeInfo('t1', tmpRoot)
    expect(info.state).toBe('conflicted')
  })

  it('throws when tab has no entry', async () => {
    await expect(mod.computeInfo('nope', tmpRoot)).rejects.toThrow(/No worktree/)
  })
})

describe('setReadyToMerge', () => {
  it('flips readyToMerge', () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    mod.setReadyToMerge(tmpRoot, 't1', true)
    const stored = JSON.parse(fs.readFileSync(mappingFile(), 'utf-8'))
    expect(stored.entries[0].readyToMerge).toBe(true)
  })

  it('is a no-op for unknown tabs', () => {
    mod.setReadyToMerge(tmpRoot, 'nope', true)
    expect(fs.existsSync(mappingFile())).toBe(false)
  })
})

describe('removeWorktree', () => {
  it('runs worktree remove and branch -D, then drops mapping entry', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs('', '')
    await mod.removeWorktree(tmpRoot, 't1', { force: true })

    expect(calls[0].args[0]).toBe('worktree')
    expect(calls[0].args[1]).toBe('remove')
    expect(calls[0].args).toContain('--force')
    expect(calls[1].args).toEqual(['branch', '-D', 'vbcdr/x-1'])

    const stored = JSON.parse(fs.readFileSync(mappingFile(), 'utf-8'))
    expect(stored.entries).toHaveLength(0)
  })

  it('falls back to fs removal when git worktree remove fails', async () => {
    const wtPath = seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs(new Error('worktree locked'), '')
    await mod.removeWorktree(tmpRoot, 't1', { force: true })
    expect(fs.existsSync(wtPath)).toBe(false)
  })

  it('skips branch deletion when deleteBranch=false', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs('')
    await mod.removeWorktree(tmpRoot, 't1', { deleteBranch: false })
    const branchCalls = calls.filter((c) => c.args[0] === 'branch')
    expect(branchCalls).toHaveLength(0)
  })
})

describe('attemptMerge', () => {
  it('returns ok when gate passes and merge succeeds', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    // diff --check (clean), status of project root (clean), current branch, merge
    setOutputs('', '', 'main', '')
    const result = await mod.attemptMerge(tmpRoot, 't1')
    expect(result.ok).toBe(true)

    const mergeCall = calls.find((c) => c.args[0] === 'merge' && c.args.includes('--no-ff'))
    expect(mergeCall).toBeDefined()
    expect(mergeCall?.args).toContain('vbcdr/x-1')

    const stored = JSON.parse(fs.readFileSync(mappingFile(), 'utf-8'))
    expect(stored.entries[0].readyToMerge).toBe(false)
  })

  it('refuses merge when project root is dirty', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs('', ' M something.ts')
    const result = await mod.attemptMerge(tmpRoot, 't1')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/uncommitted/)
  })

  it('refuses merge when diff --check fails', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    setOutputs(new Error('conflict markers'))
    const result = await mod.attemptMerge(tmpRoot, 't1')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Conflict markers/)
  })

  it('runs preMergeCommand and aborts on failure', async () => {
    seedEntry({ tabId: 't1', pathRel: '.worktrees/x', branch: 'vbcdr/x-1', baseBranch: 'main' })
    // diff --check ok, root status clean, preMerge fails
    const preMergeErr = Object.assign(new Error('typecheck failed'), { stderr: 'TS2345 ...' })
    setOutputs('', '', preMergeErr)
    const result = await mod.attemptMerge(tmpRoot, 't1', { preMergeCommand: 'npm run typecheck' })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Pre-merge/)
    // merge should not have been attempted
    expect(calls.some((c) => c.args[0] === 'merge')).toBe(false)
  })

  it('returns error when no entry exists for tab', async () => {
    const result = await mod.attemptMerge(tmpRoot, 'nope')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No worktree/)
  })
})
