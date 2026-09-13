import Store from 'electron-store'
import { v4 as uuid } from 'uuid'
import type { GitOpResult, TrackedWorktree } from '@main/models/types'
import { createWorktree, getWorktreeState, removeWorktree, renameBranch } from '@main/services/git-service'
import { getPrForBranch } from '@main/services/gh-service'

const store = new Store<{ worktrees: TrackedWorktree[] }>({
  name: 'worktrees',
  defaults: { worktrees: [] }
})

function all(): TrackedWorktree[] {
  return store.get('worktrees')
}

function save(worktrees: TrackedWorktree[]): void {
  store.set('worktrees', worktrees)
}

function update(id: string, patch: Partial<TrackedWorktree>): TrackedWorktree | null {
  const worktrees = all()
  const index = worktrees.findIndex((w) => w.id === id)
  if (index === -1) return null
  const next = { ...worktrees[index], ...patch }
  worktrees[index] = next
  save(worktrees)
  return next
}

export function listWorktrees(projectId?: string): TrackedWorktree[] {
  const worktrees = all()
  return projectId ? worktrees.filter((w) => w.projectId === projectId) : worktrees
}

export function getWorktree(id: string): TrackedWorktree | null {
  return all().find((w) => w.id === id) ?? null
}

export async function createTrackedWorktree(projectId: string, projectPath: string): Promise<TrackedWorktree> {
  const created = await createWorktree(projectPath)
  const tracked: TrackedWorktree = {
    id: uuid(),
    projectId,
    projectPath,
    path: created.path,
    branch: created.branch,
    createdAt: Date.now(),
    prUrl: null,
    prState: 'none',
    hasChanges: false,
    conflictPaths: [],
    lastCheckedAt: null
  }
  save([...all(), tracked])
  return tracked
}

export async function renameTrackedBranch(id: string, newBranch: string): Promise<GitOpResult> {
  const worktree = getWorktree(id)
  if (!worktree) return { ok: false, output: '', error: 'Unknown worktree' }
  const target = newBranch.trim()
  if (!target) return { ok: false, output: '', error: 'Branch name is empty' }
  if (target === worktree.branch) return { ok: true, output: '' }
  const result = await renameBranch(worktree.path, worktree.branch, target)
  if (result.ok) update(id, { branch: target })
  return result
}

export async function refreshWorktree(id: string): Promise<TrackedWorktree | null> {
  const worktree = getWorktree(id)
  if (!worktree) return null
  const state = await getWorktreeState(worktree.path)
  if (!state.exists) {
    untrackWorktree(id)
    return null
  }
  const pr = await getPrForBranch(worktree.path)
  return update(id, {
    hasChanges: state.hasChanges,
    conflictPaths: state.conflictPaths,
    prUrl: pr.url ?? worktree.prUrl,
    prState: pr.state === 'unknown' && worktree.prUrl ? worktree.prState : pr.state,
    lastCheckedAt: Date.now()
  })
}

export async function refreshProjectWorktrees(projectId: string): Promise<TrackedWorktree[]> {
  const ids = listWorktrees(projectId).map((w) => w.id)
  await Promise.all(ids.map((id) => refreshWorktree(id)))
  return listWorktrees(projectId)
}

export function untrackWorktree(id: string): void {
  save(all().filter((w) => w.id !== id))
}

export async function removeTrackedWorktree(id: string): Promise<GitOpResult> {
  const worktree = getWorktree(id)
  if (!worktree) return { ok: false, output: '', error: 'Unknown worktree' }
  const deleteBranch = worktree.prState === 'merged'
  const result = await removeWorktree(worktree.projectPath, worktree.path, worktree.branch, deleteBranch)
  if (result.ok) untrackWorktree(id)
  return result
}
