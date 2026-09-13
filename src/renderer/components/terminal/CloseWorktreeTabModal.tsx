import { useEffect, useState } from 'react'
import { AlertTriangle, GitBranch, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLayoutStore } from '@/stores/layout-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { sendToTerminalViaKeyboardEvent } from '@/lib/terminal-utils'
import { closeWorkflowInstruction } from '@/lib/llm-instructions'
import { PrStateBadge } from '@/components/git/PrStateBadge'
import type { TerminalTab, TrackedWorktree, WorktreeInfo } from '@/models/types'

interface CloseWorktreeTabModalProps {
  tab: TerminalTab
  worktree: WorktreeInfo
  onCancel: () => void
  onCloseTab: () => void
}

function StatusSummary({ status }: { status: TrackedWorktree }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-micro">
      <PrStateBadge state={status.prState} url={status.prUrl} />
      {status.conflictPaths.length > 0 ? (
        <span className="rounded bg-red-500/15 px-1.5 py-px font-medium text-red-400">
          {status.conflictPaths.length} conflict{status.conflictPaths.length === 1 ? '' : 's'}
        </span>
      ) : status.hasChanges ? (
        <span className="rounded bg-yellow-500/15 px-1.5 py-px font-medium text-yellow-400">Uncommitted changes</span>
      ) : (
        <span className="rounded bg-zinc-800 px-1.5 py-px font-medium text-zinc-400">Clean</span>
      )}
    </div>
  )
}

export function CloseWorktreeTabModal({ tab, worktree, onCancel, onCloseTab }: CloseWorktreeTabModalProps): React.ReactElement {
  const defaultPrompt = useLayoutStore((s) => s.closeTabWorkflowPrompt)
  const ghStatus = useWorktreeStore((s) => s.ghStatus)
  const [branch, setBranch] = useState(worktree.branch)
  const [instruction, setInstruction] = useState(defaultPrompt)
  const [status, setStatus] = useState<TrackedWorktree | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const store = useWorktreeStore.getState()
    Promise.all([store.refreshOne(worktree.id), store.loadGhStatus()])
      .then(([refreshed]) => {
        if (!cancelled) setStatus(refreshed)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [worktree.id])

  const trimmedBranch = branch.trim()
  const canRun = !busy && trimmedBranch.length > 0 && instruction.trim().length > 0

  const handleRunWorkflow = async (): Promise<void> => {
    if (!canRun) return
    setBusy(true)
    setError(null)
    if (trimmedBranch !== worktree.branch) {
      const renameError = await useWorktreeStore.getState().renameBranch(worktree.id, trimmedBranch)
      if (renameError) {
        setError(renameError)
        setBusy(false)
        return
      }
      useTerminalStore.getState().setTabWorktree(tab.id, { ...worktree, branch: trimmedBranch })
    }
    useTerminalStore.getState().setActiveTab(tab.projectId, tab.id)
    sendToTerminalViaKeyboardEvent(tab.id, closeWorkflowInstruction(instruction, trimmedBranch))
    setBusy(false)
    onCancel()
  }

  const footer = (
    <>
      <button
        onClick={onCloseTab}
        disabled={busy}
        className="mr-auto rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
        title="Close the terminal now. The worktree and branch stay on disk."
      >
        Close tab without workflow
      </button>
      <button
        onClick={onCancel}
        disabled={busy}
        className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
      >
        Cancel
      </button>
      <button
        onClick={handleRunWorkflow}
        disabled={!canRun}
        className="flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
        title="Sends the instruction to the LLM in this tab. The tab stays open while it works."
      >
        {busy && <Loader2 size={12} className="animate-spin" />}
        Run workflow
      </button>
    </>
  )

  return (
    <Modal isOpen title="Close worktree tab" onClose={onCancel} footer={footer} preventClose={busy}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Branch</label>
          <div className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5">
            <GitBranch size={13} className="shrink-0 text-zinc-500" />
            <input
              type="text"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full bg-transparent font-mono text-xs text-zinc-200 outline-none"
            />
          </div>
          <p className="mt-1 text-micro text-zinc-500">Rename before the PR is opened. The worktree folder keeps its original name.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">Status</label>
          {loading ? (
            <div className="flex items-center gap-1.5 text-micro text-zinc-500">
              <Loader2 size={11} className="animate-spin" /> Checking worktree…
            </div>
          ) : status ? (
            <StatusSummary status={status} />
          ) : (
            <span className="text-micro text-zinc-500">Worktree folder is missing on disk</span>
          )}
          {ghStatus && (!ghStatus.available || !ghStatus.authenticated) && (
            <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-micro text-amber-300">
              <AlertTriangle size={12} className="mt-px shrink-0" />
              <span>{ghStatus.message ?? 'gh is unavailable'}. The LLM can still commit and push, but it cannot open a PR.</span>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">Instruction for the LLM</label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={5}
            spellCheck={false}
            className="w-full resize-y rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs leading-relaxed text-zinc-200 outline-none focus:border-zinc-500"
          />
          <p className="mt-1 text-micro text-zinc-500">
            <code className="text-zinc-400">{'{branch}'}</code> is replaced with the branch name. Edit the default in Settings.
          </p>
        </div>

        {error && <p className="text-micro text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
