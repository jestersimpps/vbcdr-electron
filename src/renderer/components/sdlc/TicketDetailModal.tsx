import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  GitBranch,
  GitPullRequest,
  History,
  ListChecks,
  MessageSquare,
  Paperclip,
  Play,
  RotateCcw,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Markdown } from '@/components/ui/Markdown'
import { CloseWorktreeTabModal } from '@/components/terminal/CloseWorktreeTabModal'
import {
  SDLC_STAGES,
  nextStage,
  type SdlcAttachment,
  type SdlcDiffFile,
  type SdlcDiffLine,
  type SdlcTicket
} from '@/models/sdlc'
import { isHandoffStage } from '@/models/sdlc-prompts'
import { branchNameFrom, useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'
import {
  advanceAndHandOff,
  canResumeStage,
  discardTicket,
  finishTicket,
  focusTicketTab,
  refineTicket,
  rerunStage,
  resumeStage,
  sendAttachmentsToAgent,
  stageOutputReady
} from '@/lib/sdlc-handover'
import { attachmentsFromFiles } from '@/lib/sdlc-attachments'
import { cn } from '@/lib/utils'

interface TicketDetailModalProps {
  ticket: SdlcTicket | undefined
  onClose: () => void
}

const SECTION_LABEL = 'mb-1.5 flex items-center gap-1.5 text-micro uppercase tracking-wide text-zinc-500'

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function stageLabel(ticket: SdlcTicket): string {
  return SDLC_STAGES.find((s) => s.id === ticket.stage)?.label ?? ticket.stage
}

const DIFF_LINE_CLASS: Record<SdlcDiffLine['kind'], string> = {
  add: 'bg-emerald-500/10 text-emerald-300',
  remove: 'bg-red-500/10 text-red-300',
  context: 'text-zinc-500',
  meta: 'bg-zinc-800/60 text-zinc-500'
}

const DIFF_LINE_PREFIX: Record<SdlcDiffLine['kind'], string> = {
  add: '+',
  remove: '-',
  context: ' ',
  meta: ''
}

function DiffFileRow({
  file,
  isExpanded,
  onToggle,
  showBorder
}: {
  file: SdlcDiffFile
  isExpanded: boolean
  onToggle: () => void
  showBorder: boolean
}): React.ReactElement {
  return (
    <div className={cn(showBorder && 'border-t border-zinc-800/70')}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-900/60"
      >
        {isExpanded ? (
          <ChevronDown size={11} className="shrink-0 text-zinc-600" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-zinc-600" />
        )}
        <span className="truncate font-mono text-micro text-zinc-400">{file.path}</span>
        <span className="ml-auto shrink-0 font-mono text-micro tabular-nums">
          <span className="text-emerald-500">+{file.added}</span>{' '}
          <span className="text-red-500">-{file.removed}</span>
        </span>
      </button>
      {isExpanded && file.hunks.length > 0 && (
        <div className="overflow-x-auto border-t border-zinc-800/70 bg-zinc-950">
          {file.hunks.map((line, index) => (
            <div
              key={`${file.path}-${index}`}
              className={cn(
                'flex whitespace-pre px-2.5 py-px font-mono text-micro leading-relaxed',
                DIFF_LINE_CLASS[line.kind]
              )}
            >
              <span className="w-3 shrink-0 select-none opacity-60">
                {DIFF_LINE_PREFIX[line.kind]}
              </span>
              <span className="min-w-0">{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiffList({ ticket }: { ticket: SdlcTicket }): React.ReactElement | null {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  if (ticket.artifacts.diffFiles.length === 0) return null

  const allExpanded = ticket.artifacts.diffFiles.every((f) => expanded[f.path])

  const toggleAll = (): void => {
    if (allExpanded) {
      setExpanded({})
      return
    }
    setExpanded(Object.fromEntries(ticket.artifacts.diffFiles.map((f) => [f.path, true])))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className={cn(SECTION_LABEL, 'mb-0')}>
          <FileText size={11} />
          Changed files ({ticket.artifacts.diffFiles.length})
        </div>
        <button
          onClick={toggleAll}
          className="rounded px-1.5 py-0.5 text-micro text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="overflow-hidden rounded border border-zinc-800">
        {ticket.artifacts.diffFiles.map((file, index) => (
          <DiffFileRow
            key={file.path}
            file={file}
            isExpanded={!!expanded[file.path]}
            showBorder={index > 0}
            onToggle={() =>
              setExpanded((prev) => ({ ...prev, [file.path]: !prev[file.path] }))
            }
          />
        ))}
      </div>
    </div>
  )
}

function CommentThread({
  ticket,
  draft,
  onDraftChange,
  onSubmit
}: {
  ticket: SdlcTicket
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
}): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={SECTION_LABEL}>
        <MessageSquare size={11} />
        Review comments{ticket.comments.length > 0 && ` (${ticket.comments.length})`}
      </div>
      {ticket.comments.length > 0 && (
        <div className="mb-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {ticket.comments.map((comment) => (
            <div
              key={comment.id}
              className={cn(
                'rounded border px-2.5 py-2 text-xs leading-snug',
                comment.sentBack
                  ? 'border-orange-900/60 bg-orange-950/20 text-orange-200'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 text-micro text-zinc-500">
                <span className="font-medium text-zinc-400">{comment.author}</span>
                <span>{relativeTime(comment.at)}</span>
                {comment.sentBack && (
                  <span className="flex items-center gap-1 text-orange-500">
                    <RotateCcw size={9} />
                    sent back
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap">{comment.text}</p>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit()
        }}
        placeholder="Leave a note on this ticket… (⌘⏎ to submit)"
        aria-label="Review comment"
        className={cn(
          'w-full min-h-0 resize-none rounded border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500',
          ticket.comments.length === 0 ? 'flex-1' : 'h-40 shrink-0'
        )}
      />
    </div>
  )
}

/** Non-markdown stage content (checks, diffs, output) — stays static, never scrolls. */
function StageBody({ ticket }: { ticket: SdlcTicket }): React.ReactElement | null {
  const { checkOutput } = ticket.artifacts

  if (ticket.stage === 'backlog') {
    return (
      <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
        Not started. No worktree has been created yet.
      </div>
    )
  }

  if (ticket.stage === 'planning') return null

  if (ticket.stage === 'implementing') {
    return (
      <div className="space-y-3">
        {ticket.checks.length > 0 && (
          <div>
            <div className={SECTION_LABEL}>
              <ListChecks size={11} />
              Checks
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ticket.checks.map((check) => (
                <span
                  key={check.name}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-micro',
                    check.passed
                      ? 'bg-emerald-400/10 text-emerald-400'
                      : 'bg-red-400/10 text-red-400'
                  )}
                >
                  {check.passed ? <Check size={9} /> : <X size={9} />}
                  {check.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {checkOutput && (
          <div>
            <div className={SECTION_LABEL}>
              <Terminal size={11} />
              Output
            </div>
            <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-micro leading-relaxed text-zinc-400">
              {checkOutput}
            </pre>
          </div>
        )}
        <DiffList ticket={ticket} />
        {ticket.artifacts.diffFiles.length === 0 && ticket.checks.length === 0 && (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
            No changes written yet.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {ticket.checks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ticket.checks.map((check) => (
            <span
              key={check.name}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-micro',
                check.passed ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
              )}
            >
              {check.passed ? <Check size={9} /> : <X size={9} />}
              {check.name}
            </span>
          ))}
        </div>
      )}
      <DiffList ticket={ticket} />
    </div>
  )
}

/** The stage's markdown (plan / PR summary) — the one thing in the left column that scrolls. */
function StageMarkdown({ ticket }: { ticket: SdlcTicket }): React.ReactElement | null {
  const { plan, prSummary } = ticket.artifacts

  if (ticket.stage === 'planning') {
    return plan ? (
      <div className="flex h-full min-h-0 flex-col">
        <div className={SECTION_LABEL}>
          <ListChecks size={11} />
          Proposed plan
        </div>
        <Markdown
          content={plan}
          className="min-h-0 flex-1 overflow-auto rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
        />
      </div>
    ) : (
      <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
        Agent is still exploring the repo. No plan yet.
      </div>
    )
  }

  if (ticket.stage === 'review' && prSummary) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={SECTION_LABEL}>
          <FileText size={11} />
          Summary
        </div>
        <Markdown
          content={prSummary}
          className="min-h-0 flex-1 overflow-auto rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
        />
      </div>
    )
  }

  return null
}

export function TicketDetailModal({
  ticket,
  onClose
}: TicketDetailModalProps): React.ReactElement | null {
  const sendTicketBack = useSdlcStore((s) => s.sendTicketBack)
  const updateTicket = useSdlcStore((s) => s.updateTicket)
  const patchTicket = useSdlcStore((s) => s.patchTicket)
  const addComment = useSdlcStore((s) => s.addComment)
  const agentTab = useTerminalStore((s) => (ticket?.tabId ? s.tabs.find((t) => t.id === ticket.tabId) : undefined))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [wrapUpOpen, setWrapUpOpen] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [draft, setDraft] = useState('')
  const [draftAttachments, setDraftAttachments] = useState<SdlcAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')

  const isEditable = ticket?.stage === 'backlog'

  /**
   * Keyed on the ticket id alone. Depending on description/attachments too
   * would re-seed the draft on every store write — attachments is a fresh
   * array each time, so the effect would loop and the modal never settles.
   */
  useEffect(() => {
    if (!ticket) return
    setShowReject(false)
    setShowDelete(false)
    setWrapUpOpen(false)
    setRejectReason('')
    setIsDragging(false)
    setDraft(ticket.description)
    setDraftAttachments(ticket.attachments)
    setCommentDraft('')
  }, [ticket?.id])

  /**
   * In the backlog, attachments ride the draft and land with "Save changes".
   * Everywhere else they persist at once and, if the agent is live, are sent
   * to it immediately: the same gesture as pasting into Claude Code.
   */
  const addFiles = async (files: FileList | File[]): Promise<void> => {
    if (!ticket) return
    const added = await attachmentsFromFiles(files)
    if (ticket.stage === 'backlog') {
      setDraftAttachments((prev) => [...prev, ...added])
      return
    }
    patchTicket(ticket.id, { attachments: [...ticket.attachments, ...added] })
    void sendAttachmentsToAgent(ticket, added)
  }

  const removeAttachment = (id: string): void => {
    if (!ticket) return
    if (ticket.stage === 'backlog') {
      setDraftAttachments((prev) => prev.filter((a) => a.id !== id))
      return
    }
    patchTicket(ticket.id, { attachments: ticket.attachments.filter((a) => a.id !== id) })
  }

  useEffect(() => {
    if (!ticket) return
    const onPaste = (e: ClipboardEvent): void => {
      if (e.defaultPrevented) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  if (!ticket) return null

  const attachmentsChanged =
    draftAttachments.length !== ticket.attachments.length ||
    draftAttachments.some((a, i) => a.id !== ticket.attachments[i]?.id)
  const isDirty = isEditable && (draft.trim() !== ticket.description || attachmentsChanged)
  const attachments = isEditable ? draftAttachments : ticket.attachments

  const handleSave = (): void => {
    if (!draft.trim()) return
    updateTicket(ticket.id, { description: draft, attachments: draftAttachments })
  }

  const handleDelete = (): void => {
    void discardTicket(ticket.id)
    onClose()
  }

  const target = nextStage(ticket.stage)
  const canSendBack = ticket.stage !== 'backlog' && ticket.stage !== 'done'
  const isRunning = ticket.status === 'running'
  const hasRunBefore = !!ticket.tabId || !!ticket.worktreeId || ticket.status !== 'idle'
  const canHandOff = isHandoffStage(ticket.stage) && !isRunning && !hasRunBefore
  const canRefine = isHandoffStage(ticket.stage) && !isRunning && hasRunBefore
  const canResume =
    isHandoffStage(ticket.stage) && !isRunning && !agentTab && !!ticket.worktreeId && canResumeStage(ticket.stage)
  const isReview = ticket.stage === 'review'
  const outputReady = stageOutputReady(ticket)
  const advanceBlockedReason = isRunning
    ? 'The agent is still working'
    : !outputReady
      ? `Waiting for the agent's ${ticket.stage === 'planning' ? 'plan' : 'result'}`
      : isReview && !agentTab?.worktree
        ? 'Run the review stage first so there is a tab to wrap up in'
        : undefined

  const advanceLabel =
    ticket.stage === 'backlog'
      ? 'Start planning'
      : ticket.stage === 'planning'
        ? 'Approve plan'
        : ticket.stage === 'implementing'
          ? 'Send to review'
          : 'Wrap up & open PR'

  const handleAdvance = (): void => {
    if (isReview) {
      setWrapUpOpen(true)
      return
    }
    void advanceAndHandOff(ticket.id)
    onClose()
  }

  const handleHandOff = (): void => {
    void rerunStage(ticket.id)
    onClose()
  }

  const handleRefine = (): void => {
    if (!commentDraft.trim()) return
    addComment(ticket.id, commentDraft)
    void refineTicket(ticket.id, commentDraft)
    setCommentDraft('')
    onClose()
  }

  const handleResume = (): void => {
    void resumeStage(ticket.id)
    onClose()
  }

  const handleFinish = (): void => {
    void finishTicket(ticket.id)
    onClose()
  }

  const handleReject = (): void => {
    sendTicketBack(ticket.id, rejectReason)
    onClose()
  }

  return (
    <Modal
      isOpen={!!ticket}
      onClose={onClose}
      title={ticket.title}
      size={isEditable ? 'lg' : 'xl'}
      bodyScroll={!isEditable}
      headerExtra={
        ticket.artifacts.activity.length > 0 ? (
          <div className="flex max-w-xs shrink-0 items-center gap-1.5 text-micro text-zinc-500" title={ticket.artifacts.activity.map((e) => `${relativeTime(e.at)} — ${e.text}`).join('\n')}>
            <History size={11} className="shrink-0 text-zinc-600" />
            <span className="truncate">
              {relativeTime(ticket.artifacts.activity[ticket.artifacts.activity.length - 1].at)} ·{' '}
              {ticket.artifacts.activity[ticket.artifacts.activity.length - 1].text}
            </span>
          </div>
        ) : undefined
      }
      footer={
        showDelete ? (
          <>
            <span className="mr-auto text-xs text-zinc-400">
              {ticket.worktreeId
                ? `Deletes this ticket, its agent tab and the worktree on ${ticket.branch}. Uncommitted work there is lost.`
                : 'Deletes this ticket.'}
            </span>
            <button
              onClick={() => setShowDelete(false)}
              className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
            >
              <Trash2 size={12} />
              Delete ticket
            </button>
          </>
        ) : showReject ? (
          <>
            <input
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReject()
                if (e.key === 'Escape') setShowReject(false)
              }}
              placeholder="What needs to change?"
              className="mr-auto w-full max-w-xs rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
            <button
              onClick={() => setShowReject(false)}
              className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              className="rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500"
            >
              Send back
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setShowDelete(true)}
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
                onClick={handleSave}
                className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Save changes
              </button>
            )}
            {canSendBack && (
              <button
                onClick={() => setShowReject(true)}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <RotateCcw size={12} />
                Send back
              </button>
            )}
            {agentTab && (
              <button
                onClick={() => {
                  focusTicketTab(ticket)
                  onClose()
                }}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                title="Switch to the agent's terminal tab"
              >
                <Terminal size={12} />
                Open agent tab
              </button>
            )}
            {canHandOff && (
              <button
                onClick={handleHandOff}
                className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                title="Open a fresh agent tab for this stage"
              >
                <Bot size={12} />
                Hand to agent
              </button>
            )}
            {canRefine && (
              <button
                onClick={handleRefine}
                disabled={!commentDraft.trim()}
                className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
                title="Send this note to the agent — pastes into a live session, or reruns the stage with it if none is open"
              >
                <Bot size={12} />
                Refine
              </button>
            )}
            {isReview && (
              <button
                onClick={handleFinish}
                disabled={isRunning}
                className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                title="After the PR is open: remove the worktree and move the ticket to done"
              >
                <CheckCircle2 size={12} />
                Mark done
              </button>
            )}
            {target && (
              <button
                onClick={handleAdvance}
                disabled={!!advanceBlockedReason}
                className="flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                title={advanceBlockedReason}
              >
                {isReview ? <GitPullRequest size={12} /> : <Play size={12} />}
                {advanceLabel}
              </button>
            )}
          </>
        )
      }
    >
      {wrapUpOpen && agentTab?.worktree && (
        <CloseWorktreeTabModal
          tab={agentTab}
          worktree={agentTab.worktree}
          onCancel={() => setWrapUpOpen(false)}
        />
      )}
      <div
        className={cn('flex min-h-0 flex-col gap-3', isEditable ? '' : 'h-full')}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
        }}
      >
        <div className="shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-micro text-zinc-500">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
              {stageLabel(ticket)}
            </span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-400">
              {ticket.agent}
            </span>
            {ticket.branch !== '—' && (
              <span className="flex items-center gap-1 font-mono">
                <GitBranch size={10} />
                {ticket.branch}
              </span>
            )}
            <span>updated {relativeTime(ticket.updatedAt)}</span>
          </div>

          {ticket.blockedReason && (
            <div className="flex items-center gap-2 rounded border border-orange-900/60 bg-orange-950/30 px-2.5 py-2 text-xs leading-snug text-orange-300">
              <span className="flex-1">{ticket.blockedReason}</span>
              {canResume && (
                <button
                  onClick={handleResume}
                  className="flex shrink-0 items-center gap-1.5 rounded border border-orange-800/60 px-2 py-1 text-micro font-medium text-orange-200 hover:bg-orange-900/40"
                  title="Reopen the agent's last session in this worktree, with its context intact"
                >
                  <History size={11} />
                  Resume session
                </button>
              )}
            </div>
          )}

          {isEditable ? (
            <div className="relative">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
                }}
                rows={5}
                className={cn(
                  'w-full resize-none rounded border bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600',
                  isDragging ? 'border-indigo-500' : 'border-zinc-700 focus:border-zinc-500'
                )}
              />
              {isDragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-indigo-950/40 text-xs font-medium text-indigo-300">
                  Drop to attach
                </div>
              )}
            </div>
          ) : (
            <Markdown content={ticket.description} className="text-zinc-400" />
          )}

          {isEditable && attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-micro text-zinc-400"
                  title={attachment.name}
                >
                  {attachment.kind === 'image' && attachment.dataUrl ? (
                    <img src={attachment.dataUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <Paperclip size={10} className="text-zinc-600" />
                  )}
                  <span className="max-w-[12rem] truncate">{attachment.name}</span>
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                    title="Remove"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {isEditable && (
            <div
              className={cn(
                'flex items-center justify-between gap-2 rounded border border-dashed px-1.5 py-1 transition-colors',
                isDragging ? 'border-indigo-500 bg-indigo-950/30' : 'border-transparent'
              )}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-micro text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <Paperclip size={11} />
                Attach
              </button>
              <div className="flex min-w-0 items-center gap-1.5 text-micro text-zinc-600">
                <GitBranch size={11} className="shrink-0" />
                <span className="shrink-0">will branch as</span>
                <span className="truncate rounded bg-green-400/15 px-1.5 py-px font-mono font-medium text-green-400">
                  {branchNameFrom(draft)}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className={cn('flex min-h-0 flex-col space-y-3', isEditable ? 'w-full' : 'w-1/2')}>
            <StageBody ticket={ticket} />
            <div className="min-h-0 flex-1">
              <StageMarkdown ticket={ticket} />
            </div>
          </div>

          {!isEditable && (
            <div className="flex min-h-0 w-1/2 flex-col gap-2 border-l border-zinc-800 pl-4">
              <div className="min-h-0 flex-1">
                <CommentThread
                  ticket={ticket}
                  draft={commentDraft}
                  onDraftChange={setCommentDraft}
                  onSubmit={handleRefine}
                />
              </div>

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-micro text-zinc-400"
                      title={attachment.name}
                    >
                      {attachment.kind === 'image' && attachment.dataUrl ? (
                        <img src={attachment.dataUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <Paperclip size={10} className="text-zinc-600" />
                      )}
                      <span className="max-w-[12rem] truncate">{attachment.name}</span>
                      <button
                        onClick={() => removeAttachment(attachment.id)}
                        className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                        title="Remove"
                        aria-label={`Remove ${attachment.name}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex shrink-0 flex-col items-center justify-center gap-1 rounded border border-dashed px-3 py-3 text-center transition-colors',
                  isDragging
                    ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300'
                )}
              >
                <Paperclip size={14} />
                <span className="text-micro leading-snug">
                  {isDragging
                    ? 'Drop to attach'
                    : agentTab
                      ? 'Drop, paste, or click to attach — goes straight to the agent'
                      : 'Drop, paste, or click to attach — sent with the next stage'}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
