import { Bot, CheckCircle2, ExternalLink, GitPullRequest, Play, RotateCcw, Terminal, Trash2 } from 'lucide-react'
import type { SdlcTicket, SdlcStage } from '@/models/sdlc'
import { cn } from '@/lib/utils'

const CANCEL_BUTTON = 'rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
const GHOST_BUTTON = 'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
const OUTLINE_BUTTON =
  'flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40'

function DeleteConfirmFooter({
  ticket,
  onCancel,
  onConfirm
}: {
  ticket: SdlcTicket
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  return (
    <>
      <span className="mr-auto text-xs text-zinc-400">
        {ticket.worktreeId
          ? `Deletes this ticket, its agent tab and the worktree on ${ticket.branch}. Uncommitted work there is lost.`
          : 'Deletes this ticket.'}
      </span>
      <button onClick={onCancel} className={CANCEL_BUTTON}>
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
      >
        <Trash2 size={12} />
        Delete ticket
      </button>
    </>
  )
}

function RejectConfirmFooter({
  reason,
  onReasonChange,
  onCancel,
  onConfirm
}: {
  reason: string
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  return (
    <>
      <input
        autoFocus
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="What needs to change?"
        className="mr-auto w-full max-w-xs rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
      />
      <button onClick={onCancel} className={CANCEL_BUTTON}>
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500"
      >
        Send back
      </button>
    </>
  )
}

/** What each stage's advance button needs to know: where it goes, what to call it, and why it might be disabled. */
export interface AdvanceState {
  target: SdlcStage | null
  label: string
  blockedReason: string | undefined
}

/** Which of the stage-dependent actions are currently available. */
export interface StageActions {
  canSendBack: boolean
  canHandOff: boolean
  canRefine: boolean
  isReview: boolean
  isRunning: boolean
}

function ActionFooter({
  ticket,
  isDirty,
  onSave,
  actions,
  hasAgentTab,
  onOpenAgentTab,
  onShowDelete,
  onShowReject,
  onHandOff,
  onRefine,
  onFinish,
  commentDraft,
  advance,
  onAdvance
}: {
  ticket: SdlcTicket
  isDirty: boolean
  onSave: () => void
  actions: StageActions
  hasAgentTab: boolean
  onOpenAgentTab: () => void
  onShowDelete: () => void
  onShowReject: () => void
  onHandOff: () => void
  onRefine: () => void
  onFinish: () => void
  commentDraft: string
  advance: AdvanceState
  onAdvance: () => void
}): React.ReactElement {
  return (
    <>
      <button
        onClick={onShowDelete}
        className="mr-auto flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
        title={ticket.worktreeId ? 'Delete the ticket and its worktree' : 'Delete the ticket'}
      >
        <Trash2 size={12} />
        Delete
      </button>
      {ticket.prUrl && (
        <a
          href={ticket.prUrl}
          target="_blank"
          rel="noreferrer"
          className="mr-auto flex items-center gap-1.5 text-micro text-zinc-500 hover:text-zinc-300"
        >
          <ExternalLink size={11} />
          View pull request
        </a>
      )}
      {isDirty && (
        <button
          onClick={onSave}
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Save changes
        </button>
      )}
      {actions.canSendBack && (
        <button onClick={onShowReject} className={GHOST_BUTTON}>
          <RotateCcw size={12} />
          Send back
        </button>
      )}
      {hasAgentTab && (
        <button onClick={onOpenAgentTab} className={GHOST_BUTTON} title="Switch to the agent's terminal tab">
          <Terminal size={12} />
          Open agent tab
        </button>
      )}
      {actions.canHandOff && (
        <button onClick={onHandOff} className={OUTLINE_BUTTON} title="Open a fresh agent tab for this stage">
          <Bot size={12} />
          Hand to agent
        </button>
      )}
      {actions.canRefine && (
        <button
          onClick={onRefine}
          disabled={!commentDraft.trim()}
          className={cn(OUTLINE_BUTTON, 'disabled:hover:bg-transparent')}
          title="Send this note to the agent — pastes into a live session, or reruns the stage with it if none is open"
        >
          <Bot size={12} />
          Refine
        </button>
      )}
      {actions.isReview && (
        <button
          onClick={onFinish}
          disabled={actions.isRunning}
          className={OUTLINE_BUTTON}
          title="After the PR is open: remove the worktree and move the ticket to done"
        >
          <CheckCircle2 size={12} />
          Mark done
        </button>
      )}
      {advance.target && (
        <button
          onClick={onAdvance}
          disabled={!!advance.blockedReason}
          className="flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          title={advance.blockedReason}
        >
          {actions.isReview ? <GitPullRequest size={12} /> : <Play size={12} />}
          {advance.label}
        </button>
      )}
    </>
  )
}

interface TicketStageFooterProps {
  ticket: SdlcTicket
  showDelete: boolean
  onShowDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  showReject: boolean
  rejectReason: string
  onRejectReasonChange: (value: string) => void
  onShowReject: () => void
  onCancelReject: () => void
  onReject: () => void
  isDirty: boolean
  onSave: () => void
  actions: StageActions
  hasAgentTab: boolean
  onOpenAgentTab: () => void
  onHandOff: () => void
  commentDraft: string
  onRefine: () => void
  onFinish: () => void
  advance: AdvanceState
  onAdvance: () => void
}

/** Picks which of the three footer states to show: confirming a delete, confirming a send-back, or the normal action bar. */
export function TicketStageFooter({
  ticket,
  showDelete,
  onShowDelete,
  onCancelDelete,
  onDelete,
  showReject,
  rejectReason,
  onRejectReasonChange,
  onShowReject,
  onCancelReject,
  onReject,
  isDirty,
  onSave,
  actions,
  hasAgentTab,
  onOpenAgentTab,
  onHandOff,
  commentDraft,
  onRefine,
  onFinish,
  advance,
  onAdvance
}: TicketStageFooterProps): React.ReactElement {
  if (showDelete) return <DeleteConfirmFooter ticket={ticket} onCancel={onCancelDelete} onConfirm={onDelete} />

  if (showReject) {
    return (
      <RejectConfirmFooter
        reason={rejectReason}
        onReasonChange={onRejectReasonChange}
        onCancel={onCancelReject}
        onConfirm={onReject}
      />
    )
  }

  return (
    <ActionFooter
      ticket={ticket}
      isDirty={isDirty}
      onSave={onSave}
      actions={actions}
      hasAgentTab={hasAgentTab}
      onOpenAgentTab={onOpenAgentTab}
      onShowDelete={onShowDelete}
      onShowReject={onShowReject}
      onHandOff={onHandOff}
      onRefine={onRefine}
      onFinish={onFinish}
      commentDraft={commentDraft}
      advance={advance}
      onAdvance={onAdvance}
    />
  )
}
