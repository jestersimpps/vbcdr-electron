import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, GitMerge, Trash2, Loader2, FlaskConical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorktreeStore } from '@/stores/worktree-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useGitStore } from '@/stores/git-store'
import { useProjectStore } from '@/stores/project-store'
import type { WorktreeInfo } from '@/models/types'

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
  const removeForTab = useWorktreeStore((s) => s.removeForTab)
  const isRepo = useGitStore((s) => s.isRepoPerProject[projectId] ?? false)
  const projectPath = useProjectStore((s) => s.projects.find((p) => p.id === projectId)?.path)
  const worktreesPerTab = useWorktreeStore((s) => s.worktreesPerTab)
  const liveWorktrees = useMemo(
    () =>
      projectPath
        ? Object.values(worktreesPerTab).filter((w) => w.projectRoot === projectPath)
        : [],
    [worktreesPerTab, projectPath]
  )
  const liveWorktreeCount = liveWorktrees.length

  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)

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

  const handleSwitchToTab = useCallback((targetTabId: string, targetProjectRoot: string) => {
    const targetTab = useTerminalStore.getState().tabs.find((t) => t.id === targetTabId)
    if (!targetTab) return
    const targetProject = useProjectStore.getState().projects.find((p) => p.path === targetProjectRoot)
    if (targetProject && targetProject.id !== useProjectStore.getState().activeProjectId) {
      useProjectStore.getState().setActiveProject(targetProject.id)
    }
    useTerminalStore.getState().setActiveTab(targetTab.projectId, targetTabId)
  }, [])

  const handleDiscardByTab = useCallback(async (targetTabId: string) => {
    await useWorktreeStore.getState().removeForTab(targetTabId, { force: true, deleteBranch: true })
  }, [])

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

  // Discoverable opt-in: a small "experimental" pill on LLM tabs in a git repo
  // when worktrees aren't yet enabled for this project.
  if (!info && !pending && isRepo && !enabled) {
    return (
      <>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        <button
          onClick={() => setIntroOpen(true)}
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-micro font-medium text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
          title="Run new LLM tabs in their own git worktree"
        >
          <FlaskConical size={11} />
          <span>Use worktrees</span>
        </button>
        {introOpen && createPortal(
          <WorktreeIntroModal
            mode="intro"
            onCancel={() => setIntroOpen(false)}
            onAccept={() => {
              setEnabled(projectId, true)
              setIntroOpen(false)
            }}
          />,
          document.body
        )}
      </>
    )
  }

  // If enabled but the active tab predates the toggle (no worktree yet), offer to start one.
  // The branch-chip → modal flow handles disabling once a worktree is active.
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
          className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-micro font-medium text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
          title="Spawn a worktree for this tab"
        >
          <GitBranch size={11} />
          <span>Spawn worktree</span>
        </button>
        <button
          onClick={() => setIntroOpen(true)}
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-micro font-medium text-zinc-500 hover:bg-zinc-700/60 hover:text-zinc-300"
          title="Worktrees info"
        >
          <FlaskConical size={11} />
        </button>
        {introOpen && createPortal(
          <WorktreeIntroModal
            mode="manage"
            canDisable={liveWorktreeCount === 0}
            liveWorktrees={liveWorktrees}
            onSwitchToTab={handleSwitchToTab}
            onDiscardOne={handleDiscardByTab}
            onCancel={() => setIntroOpen(false)}
            onDisable={() => {
              setEnabled(projectId, false)
              setIntroOpen(false)
            }}
          />,
          document.body
        )}
      </>
    )
  }

  if (pending) {
    return (
      <>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        <span className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-micro font-medium text-zinc-400">
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
      <button
        onClick={() => setIntroOpen(true)}
        onMouseDown={(e) => e.preventDefault()}
        className="flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-1 text-micro font-medium text-zinc-300 hover:bg-zinc-700/60"
        title={`${info.path}\nClick for info or to disable worktrees`}
      >
        <GitBranch size={11} className={stateColor} />
        <span>{branchShort}</span>
      </button>
      {info.changedFiles > 0 && (
        <span className="rounded bg-zinc-700/40 px-1.5 py-px text-micro font-medium text-zinc-400" title="Uncommitted changes">
          {info.changedFiles} file{info.changedFiles === 1 ? '' : 's'}
        </span>
      )}
      {info.ahead > 0 && (
        <span className="rounded bg-blue-500/15 px-1.5 py-px text-micro font-medium text-blue-400" title="Commits ahead of base branch">
          {info.ahead} ahead
        </span>
      )}
      <button
        onClick={handleMerge}
        disabled={!canMerge}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-micro font-medium',
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
        onClick={handleDiscard}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-micro font-medium',
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
        <span className="rounded bg-red-500/15 px-1.5 py-px text-micro font-medium text-red-400" title={mergeError}>
          {mergeError.length > 32 ? mergeError.slice(0, 32) + '…' : mergeError}
        </span>
      )}
      {introOpen && createPortal(
        <WorktreeIntroModal
          mode="manage"
          canDisable={liveWorktreeCount === 0}
          liveWorktrees={liveWorktrees}
          onSwitchToTab={handleSwitchToTab}
          onDiscardOne={handleDiscardByTab}
          onCancel={() => setIntroOpen(false)}
          onDisable={() => {
            setEnabled(projectId, false)
            setIntroOpen(false)
          }}
        />,
        document.body
      )}
    </>
  )
}

function WorktreeIntroModal({
  mode,
  canDisable,
  liveWorktrees = [],
  onCancel,
  onAccept,
  onDisable,
  onSwitchToTab,
  onDiscardOne
}: {
  mode: 'intro' | 'manage'
  canDisable?: boolean
  liveWorktrees?: WorktreeInfo[]
  onCancel: () => void
  onAccept?: () => void
  onDisable?: () => void
  onSwitchToTab?: (tabId: string, projectRoot: string) => void
  onDiscardOne?: (tabId: string) => void
}): React.ReactElement {
  const title = mode === 'intro' ? 'Use git worktrees for LLM tabs' : 'Worktrees for LLM tabs'
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="mx-4 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical size={14} className="text-emerald-400" />
            <span className="text-sm font-medium text-zinc-200">{title}</span>
            <span className="rounded bg-amber-500/15 px-1.5 py-px text-micro font-medium uppercase tracking-wide text-amber-400">
              Beta
            </span>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-meta leading-relaxed text-amber-300/90">
          This feature is experimental. Expect rough edges, and keep important work committed before relying on it.
        </div>

        <p className="mb-3 text-xs leading-relaxed text-zinc-400">
          Each new LLM tab gets its own git worktree on a fresh branch off your current branch.
          The LLM works in isolation, your main checkout stays untouched.
        </p>

        <div className="mb-3 space-y-2 rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
          <div className="flex items-start gap-2">
            <GitBranch size={11} className="mt-0.5 shrink-0 text-zinc-400" />
            <span>Branch chip shows where the LLM is working</span>
          </div>
          <div className="flex items-start gap-2">
            <GitMerge size={11} className="mt-0.5 shrink-0 text-emerald-400" />
            <span><span className="font-medium text-emerald-400">Merge</span> brings the LLM&apos;s commits into your base branch</span>
          </div>
          <div className="flex items-start gap-2">
            <Trash2 size={11} className="mt-0.5 shrink-0 text-red-400" />
            <span><span className="font-medium text-red-400">Discard</span> deletes the worktree and its branch</span>
          </div>
        </div>

        {mode === 'manage' && liveWorktrees.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-meta font-medium text-zinc-400">
              Active worktrees ({liveWorktrees.length})
            </div>
            <div className="overflow-hidden rounded border border-zinc-800">
              {liveWorktrees.map((wt) => {
                const branchShort = wt.branch.replace(/^vbcdr\//, '')
                const stateColor =
                  wt.state === 'conflicted'
                    ? 'text-red-400'
                    : wt.state === 'dirty'
                      ? 'text-amber-400'
                      : wt.state === 'ahead'
                        ? 'text-blue-400'
                        : 'text-zinc-400'
                const stateLabel =
                  wt.state === 'idle' && wt.ahead === 0 && wt.changedFiles === 0
                    ? 'clean'
                    : wt.state === 'dirty'
                      ? `${wt.changedFiles} file${wt.changedFiles === 1 ? '' : 's'}`
                      : wt.state === 'ahead'
                        ? `${wt.ahead} ahead`
                        : wt.state
                return (
                  <div
                    key={wt.tabId}
                    className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-2 py-1.5 last:border-b-0 hover:bg-zinc-900"
                  >
                    <button
                      onClick={() => onSwitchToTab?.(wt.tabId, wt.projectRoot)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      title="Switch to this LLM tab"
                    >
                      <GitBranch size={11} className={cn('shrink-0', stateColor)} />
                      <span className="truncate text-meta text-zinc-200">{branchShort}</span>
                      <span className={cn('shrink-0 text-micro', stateColor)}>{stateLabel}</span>
                    </button>
                    <button
                      onClick={() => onDiscardOne?.(wt.tabId)}
                      className="shrink-0 rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-400"
                      title="Discard this worktree and its branch"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="mb-4 text-meta leading-relaxed text-zinc-500">
          Heads up: each worktree is a fresh checkout, so <span className="text-zinc-300">node_modules</span> and other build artifacts aren&apos;t shared.
          The LLM may need to install or rebuild on first run.
        </p>

        {mode === 'intro' ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Not now
            </button>
            <button
              onClick={onAccept}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Enable for this project
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onDisable}
              disabled={!canDisable}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium',
                canDisable
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'bg-zinc-800 text-zinc-600'
              )}
              title={canDisable ? 'Turn off worktrees for this project' : 'Discard all live worktrees first'}
            >
              Disable for this project
            </button>
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
