import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  addWorktreeForBranch,
  commitWorktreeWork,
  createWorktree,
  ensureInfoExclude,
  pointBranchAt,
  removeWorktree,
  syncDefaultBranch
} from './git-service'

let root: string
let origin: string
let project: string
let teammate: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function configure(repo: string): void {
  git(repo, 'config', 'user.email', 'test@example.com')
  git(repo, 'config', 'user.name', 'Test')
  git(repo, 'config', 'commit.gpgsign', 'false')
}

function commitFile(repo: string, name: string, content: string): string {
  fs.writeFileSync(path.join(repo, name), content)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-m', `add ${name}`)
  return git(repo, 'rev-parse', 'HEAD')
}

function clone(name: string): string {
  const target = path.join(root, name)
  git(root, 'clone', '-q', origin, target)
  configure(target)
  return target
}

function teammatePushes(name: string): string {
  git(teammate, 'pull', '-q', 'origin', 'main')
  const hash = commitFile(teammate, name, name)
  git(teammate, 'push', '-q', 'origin', 'main')
  return hash
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-flow-')))
  origin = path.join(root, 'origin.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', origin)
  const seed = path.join(root, 'seed')
  git(root, 'init', '-q', '-b', 'main', seed)
  configure(seed)
  commitFile(seed, 'README.md', 'seed')
  git(seed, 'remote', 'add', 'origin', origin)
  git(seed, 'push', '-q', 'origin', 'main')
  project = clone('project')
  teammate = clone('teammate')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('new ticket: worktree from the latest default branch', () => {
  it('pulls the checked-out default branch and cuts the worktree from the pulled commit', async () => {
    const latest = teammatePushes('feature.txt')

    const base = await syncDefaultBranch(project)
    const worktree = await createWorktree(project, undefined, base.ref)

    expect(base).toEqual({ ref: 'main', syncError: null })
    expect(git(project, 'rev-parse', 'main')).toBe(latest)
    expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(latest)
    expect(fs.existsSync(path.join(worktree.path, 'feature.txt'))).toBe(true)
  })

  it('updates main without touching the checkout when the user is on another branch with local edits', async () => {
    git(project, 'checkout', '-q', '-b', 'side')
    fs.writeFileSync(path.join(project, 'README.md'), 'half-finished edit')
    const latest = teammatePushes('feature.txt')

    const base = await syncDefaultBranch(project)
    const worktree = await createWorktree(project, undefined, base.ref)

    expect(base.syncError).toBeNull()
    expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(latest)
    expect(git(project, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('side')
    expect(fs.readFileSync(path.join(project, 'README.md'), 'utf-8')).toBe('half-finished edit')
  })

  it('keeps unpushed local commits: a main that is only ahead of origin is not a failure', async () => {
    git(project, 'checkout', '-q', '-b', 'side')
    git(project, 'checkout', '-q', 'main')
    const local = commitFile(project, 'local.txt', 'unpushed')
    git(project, 'checkout', '-q', 'side')

    const base = await syncDefaultBranch(project)
    const worktree = await createWorktree(project, undefined, base.ref)

    expect(base).toEqual({ ref: 'main', syncError: null })
    expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(local)
  })

  it('reports a diverged main and still cuts the worktree from the local one', async () => {
    teammatePushes('theirs.txt')
    const local = commitFile(project, 'mine.txt', 'mine')

    const base = await syncDefaultBranch(project)
    const worktree = await createWorktree(project, undefined, base.ref)

    expect(base.ref).toBe('main')
    expect(base.syncError).toBeTruthy()
    expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(local)
    expect(git(project, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })

  it('works in a repository that has no remote', async () => {
    git(project, 'remote', 'remove', 'origin')
    const base = await syncDefaultBranch(project)
    expect(base).toEqual({ ref: 'main', syncError: null })
  })
})

describe('ticket done: the work stays on a branch', () => {
  it('commits what the agent left uncommitted, removes the worktree and keeps the branch', async () => {
    const base = await syncDefaultBranch(project)
    const worktree = await createWorktree(project, 'llm/add-auth', base.ref)
    await ensureInfoExclude(project, '.vbcdr/')
    commitFile(worktree.path, 'committed.txt', 'by the agent')
    fs.writeFileSync(path.join(worktree.path, 'leftover.txt'), 'never committed')
    fs.mkdirSync(path.join(worktree.path, '.vbcdr'))
    fs.writeFileSync(path.join(worktree.path, '.vbcdr', 'stage-output.md'), 'sentinel')

    const committed = await commitWorktreeWork(worktree.path, 'Add auth')
    const removed = await removeWorktree(project, worktree.path, worktree.branch, false)
    const pointed = await pointBranchAt(project, worktree.branch, committed.output)

    expect([committed.ok, removed.ok, pointed.ok]).toEqual([true, true, true])
    expect(fs.existsSync(worktree.path)).toBe(false)
    expect(git(project, 'worktree', 'list')).not.toContain('add-auth')
    const files = git(project, 'ls-tree', '-r', '--name-only', 'llm/add-auth').split('\n')
    expect(files).toEqual(expect.arrayContaining(['committed.txt', 'leftover.txt']))
    expect(files.some((f) => f.startsWith('.vbcdr'))).toBe(false)
    expect(git(project, 'log', '-1', '--format=%s', 'llm/add-auth')).toBe('Add auth')
    expect(git(project, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('reopens the kept branch in a fresh worktree for the done prompt', async () => {
    const worktree = await createWorktree(project, 'llm/reopen', 'main')
    commitFile(worktree.path, 'work.txt', 'done')
    await removeWorktree(project, worktree.path, worktree.branch, false)

    const reopened = await addWorktreeForBranch(project, 'llm/reopen')

    expect(reopened.path).toBe(worktree.path)
    expect(fs.readFileSync(path.join(reopened.path, 'work.txt'), 'utf8')).toBe('done')
    expect(git(reopened.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('llm/reopen')
  })

  it('adds no commit when the worktree is already clean', async () => {
    const worktree = await createWorktree(project, 'llm/clean', 'main')
    const head = commitFile(worktree.path, 'done.txt', 'done')
    const committed = await commitWorktreeWork(worktree.path, 'Clean')
    expect(committed).toEqual({ ok: true, output: head })
  })

  it('moves the ticket branch onto work the agent left on a detached HEAD', async () => {
    const worktree = await createWorktree(project, 'llm/detached', 'main')
    git(worktree.path, 'checkout', '-q', '--detach')
    const detached = commitFile(worktree.path, 'detached.txt', 'work')

    const committed = await commitWorktreeWork(worktree.path, 'Detached')
    await removeWorktree(project, worktree.path, worktree.branch, false)
    await pointBranchAt(project, worktree.branch, committed.output)

    expect(git(project, 'rev-parse', 'llm/detached')).toBe(detached)
  })
})
