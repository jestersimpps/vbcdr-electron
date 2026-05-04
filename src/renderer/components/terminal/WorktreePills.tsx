import { useCallback, useEffect, useState } from 'react'
import { GitBranch, GitMerge, Bot, Trash2, Loader2, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorktreeStore } from '@/stores/worktree-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useGitStore } from '@/stores/git-store'
import { useProjectStore } from '@/stores/project-store'

interface Props {
  tabId: string
  projectId: string
}

const REFRESH_INTERVAL_MS = 5000

export function WorktreePills({ tabId, projectId }: Props): React.ReactElement | null {
  const info = useWorktreeStore((s) => s.worktreesPerTab[tabId])
  const pending = useWorktreeStore((s) => !!s.pendingTabs[tabId])
  const enabled = useWorktreeStore((s) => s.enabledPerProject[projectId] ?? false)
  const setEnabled = useWorktreeStore((s) => s.setEnabled)
  const refresh = useWorktreeStore((s) => s.refresh)
  const merge = useWorktreeStore((s) => s.merge)
  const setAutoMergeFn = useWorktreeStore((s) => s.setAutoMerge)
  const removeForTab = useWorktreeStore((s) => s.removeForTab)
  const isRepo = useGitStore((s) => s.isRepoPerProject[projectId] ?? false)
  const projectPath = useProjectStore((s) => s.projects.find((p) => p.id === projectId)?.path)

  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    if (!info) return
    const id = setInterval(() => {
      void refresh(tabId, info.projectRoot)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [info?.projectRoot, tabId, refresh])

  useEffect(() => {
    if (!confirmDiscard) return
    const t = setTimeout(() => setConfirmDiscard(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDiscard])

  const handleMerge = useCallback(async () => {
    if (!info || merging) return
    setMerging(true)
    setMergeError(null)
    const result = await merge(tabId, projectId)
    setMerging(false)
    if (!result.ok) setMergeError(result.reason ?? 'Merge failed')
  }, [info, merging, merge, tabId, projectId])

  const handleDiscard = useCallback(async () => {
    if (!info) return
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    setConfirmDiscard(false)
    await removeForTab(tabId, { force: true, deleteBranch: true })
    // Reflect the new cwd in the tab so subsequent restarts use the project root.
    useTerminalStore.setState((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, cwd: info.projectRoot } : t))
    }))
  }, [info, confirmDiscard, removeForTab, tabId])

  const handleToggleAuto = useCallback(async () => {
    if (!info) return
    await setAutoMergeFn(tabId, !info.autoMerge)
  }, [info, setAutoMergeFn, tabId])

  // Discoverable opt-in: a small "experimental" pill on LLM tabs in a git repo
  // when worktrees aren't yet enabled for this project.
  if (!info && !pending && isRepo && !enabled) {
    return (
      <>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        <button
          onClick={() => setEnabled(projectId, true)}
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
          title="Run new LLM tabs in their own git worktree"
        >
          <FlaskConical size={11} />
          <span>Use worktrees</span>
        </button>
      </>
    )
  }

  // If enabled but the active tab predates the toggle (no worktree yet), offer to start one.
  if (!info && !pending && isRepo && enabled && projectPath) {
    return (
      <>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        <button
          onClick={() => {
            void useWorktreeStore.getState().createForTab(tabId, projectPath, 'claude').then((wt) => {
              if (wt) {
                useTerminalStore.setState((state) => ({
                  tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, cwd: wt.path } : t))
                }))
              }
            })
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
          title="Spawn a worktree for this tab"
        >
          <GitBranch size={11} />
          <span>Spawn worktree</span>
        </button>
      </>
    )
  }

  if (pending) {
    return (
      <>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        <span className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-[10px] font-medium text-zinc-400">
          <Loader2 size={11} className="animate-spin" />
          <span>Creating worktree…</span>
        </span>
      </>
    )
  }

  if (!info) return null

  const branchShort = info.branch.replace(/^vbcdr\//, '')
  const canMerge = info.state === 'ahead' && !merging
  const stateColor =
    info.state === 'conflicted'
      ? 'text-red-400'
      : info.state === 'dirty'
        ? 'text-amber-400'
        : info.state === 'ahead'
          ? 'text-blue-400'
          : 'text-zinc-400'

  return (
    <>
      <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
      <span
        className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-[10px] font-medium text-zinc-300"
        title={info.path}
      >
        <GitBranch size={11} className={stateColor} />
        <span>{branchShort}</span>
      </span>
      {info.changedFiles > 0 && (
        <span className="rounded bg-zinc-700/40 px-1.5 py-px text-[10px] font-medium text-zinc-400" title="Uncommitted changes">
          {info.changedFiles} file{info.changedFiles === 1 ? '' : 's'}
        </span>
      )}
      {info.ahead > 0 && (
        <span className="rounded bg-blue-500/15 px-1.5 py-px text-[10px] font-medium text-blue-400" title="Commits ahead of base branch">
          {info.ahead} ahead
        </span>
      )}
      <button
        onClick={handleMerge}
        disabled={!canMerge}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium',
          canMerge
            ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
            : 'bg-zinc-700/30 text-zinc-500',
          info.readyToMerge && canMerge ? 'ring-1 ring-emerald-400/40 animate-pulse' : ''
        )}
        title={
          info.state === 'conflicted'
            ? 'Worktree has conflicts'
            : info.state === 'dirty'
              ? 'Commit changes in the worktree first'
              : info.ahead === 0
                ? 'No commits to merge'
                : `Merge ${info.ahead} commit${info.ahead === 1 ? '' : 's'} into ${info.baseBranch}`
        }
      >
        {merging ? <Loader2 size={11} className="animate-spin" /> : <GitMerge size={11} />}
        <span>{merging ? 'Merging…' : 'Merge'}</span>
      </button>
      <button
        onClick={handleToggleAuto}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium',
          info.autoMerge
            ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 ring-1 ring-violet-400/30'
            : 'bg-zinc-700/40 text-zinc-400 hover:bg-zinc-700/60'
        )}
        title={info.autoMerge ? 'Auto-merge: on (LLM may /merge itself)' : 'Auto-merge: off'}
      >
        <Bot size={11} />
        <span>Auto{info.autoMerge ? ': on' : ''}</span>
      </button>
      <button
        onClick={handleDiscard}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium',
          confirmDiscard
            ? 'bg-red-500/30 text-red-300 ring-1 ring-red-400/40'
            : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
        )}
        title={confirmDiscard ? 'Click again to confirm' : 'Discard worktree and branch'}
      >
        <Trash2 size={11} />
        <span>{confirmDiscard ? 'Sure?' : 'Discard'}</span>
      </button>
      {mergeError && (
        <span className="rounded bg-red-500/15 px-1.5 py-px text-[10px] font-medium text-red-400" title={mergeError}>
          {mergeError.length > 32 ? mergeError.slice(0, 32) + '…' : mergeError}
        </span>
      )}
    </>
  )
}
