import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FolderGit2, Loader2, RefreshCw, TerminalSquare, Trash2, Wrench } from 'lucide-react'
import { useWorktreeStore } from '@/stores/worktree-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { openWorktreeTab } from '@/lib/worktree-tabs'
import { conflictResolutionInstruction } from '@/lib/llm-instructions'
import { disposeTerminal } from '@/components/terminal/TerminalInstance'
import { PrStateBadge } from '@/components/git/PrStateBadge'
import type { TrackedWorktree } from '@/models/types'

const REFRESH_INTERVAL_MS = 60_000

function WorktreeRow({ worktree }: { worktree: TrackedWorktree }): React.ReactElement {
  const liveTab = useTerminalStore((s) => s.tabs.find((t) => t.worktree?.id === worktree.id))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const conflictCount = worktree.conflictPaths.length

  const handleFixConflicts = (): void => {
    openWorktreeTab(worktree, conflictResolutionInstruction(worktree.conflictPaths))
  }

  const handleRemove = async (): Promise<void> => {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setRemoving(true)
    setError(null)
    if (liveTab) {
      window.api.terminal.kill(liveTab.id)
      disposeTerminal(liveTab.id)
      useTerminalStore.getState().closeTab(liveTab.id)
    }
    const removeError = await useWorktreeStore.getState().remove(worktree.id)
    if (removeError) setError(removeError)
    setRemoving(false)
    setConfirmRemove(false)
  }

  return (
    <div className="border-b border-zinc-800/60 px-2 py-1">
      <div className="flex items-center gap-1.5">
        <span
          className={liveTab ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400' : 'h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-700'}
          title={liveTab ? 'Tab open' : 'No open tab'}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-micro text-zinc-200" title={worktree.path}>
          {worktree.branch}
        </span>
        {conflictCount > 0 && (
          <button
            onClick={handleFixConflicts}
            className="flex shrink-0 items-center gap-1 rounded bg-red-500/15 px-1.5 py-px text-micro font-medium text-red-400 hover:bg-red-500/25"
            title="Ask the LLM to resolve the conflicts in this worktree"
          >
            <Wrench size={9} />
            {conflictCount} conflict{conflictCount === 1 ? '' : 's'}
          </button>
        )}
        {conflictCount === 0 && worktree.hasChanges && (
          <span className="shrink-0 rounded bg-yellow-500/15 px-1.5 py-px text-micro font-medium text-yellow-400">changes</span>
        )}
        <PrStateBadge state={worktree.prState} url={worktree.prUrl} />
        <button
          onClick={() => openWorktreeTab(worktree)}
          className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title={liveTab ? 'Go to tab' : 'Reopen an LLM tab in this worktree'}
        >
          <TerminalSquare size={12} />
        </button>
        <button
          onClick={handleRemove}
          onBlur={() => setConfirmRemove(false)}
          disabled={removing}
          className={
            confirmRemove
              ? 'flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-px text-micro font-medium text-white'
              : 'shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40'
          }
          title={
            worktree.prState === 'merged'
              ? 'Remove the worktree folder and delete the merged branch'
              : 'Remove the worktree folder. The branch is kept.'
          }
        >
          {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {confirmRemove && !removing && <span>Remove?</span>}
        </button>
      </div>
      {error && <p className="mt-1 text-micro text-red-400">{error}</p>}
    </div>
  )
}

export function WorktreePrPanel({ projectId }: { projectId: string }): React.ReactElement | null {
  const worktrees = useWorktreeStore((s) => s.worktreesPerProject[projectId])
  const refreshing = useWorktreeStore((s) => !!s.refreshingPerProject[projectId])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const store = useWorktreeStore.getState()
    store.load(projectId).then(() => store.refreshProject(projectId))
    const timer = setInterval(() => useWorktreeStore.getState().refreshProject(projectId), REFRESH_INTERVAL_MS)
    return (): void => clearInterval(timer)
  }, [projectId])

  if (!worktrees || worktrees.length === 0) return null

  return (
    <div className="border-b border-zinc-800">
      <div className="flex h-8 items-center gap-1.5 px-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={collapsed ? 'Expand worktrees' : 'Collapse worktrees'}
        >
          {collapsed ? <ChevronRight size={12} className="shrink-0 text-zinc-500" /> : <ChevronDown size={12} className="shrink-0 text-zinc-500" />}
          <FolderGit2 size={12} className="shrink-0 text-indigo-400" />
          <span className="min-w-0 flex-1 truncate text-body text-zinc-200">Worktrees</span>
          <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-px text-micro font-medium text-indigo-400">
            {worktrees.length}
          </span>
        </button>
        <button
          onClick={() => useWorktreeStore.getState().refreshProject(projectId)}
          disabled={refreshing}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
          title="Refresh PR status and conflicts"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : undefined} />
        </button>
      </div>
      {!collapsed && worktrees.map((w) => <WorktreeRow key={w.id} worktree={w} />)}
    </div>
  )
}
