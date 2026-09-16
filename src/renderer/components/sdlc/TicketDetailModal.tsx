import { useEffect, useRef, useState } from 'react'
import { GitBranch, History } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Markdown } from '@/components/ui/Markdown'
import { CloseWorktreeTabModal } from '@/components/terminal/CloseWorktreeTabModal'
import { relativeTime } from '@/components/sdlc/TicketStageParts'
import { TicketStageFooter, type AdvanceState, type StageActions } from '@/components/sdlc/TicketStageFooter'
import { BacklogBody } from '@/components/sdlc/stages/BacklogBody'
import { PlanningBody } from '@/components/sdlc/stages/PlanningBody'
import { ImplementingBody } from '@/components/sdlc/stages/ImplementingBody'
import { ReviewBody } from '@/components/sdlc/stages/ReviewBody'
import { DoneBody } from '@/components/sdlc/stages/DoneBody'
import { SDLC_STAGES, nextStage, type SdlcAttachment, type SdlcTicket } from '@/models/sdlc'
import { isHandoffStage } from '@/models/sdlc-prompts'
import { useSdlcStore } from '@/stores/sdlc-store'
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

function stageLabel(ticket: SdlcTicket): string {
  return SDLC_STAGES.find((s) => s.id === ticket.stage)?.label ?? ticket.stage
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
  const isClosed = ticket?.stage === 'done'
  /** Planning, implementing, review: the three stages with a live or recent agent run and a comment thread. */
  const isLiveStage = ticket ? !isEditable && !isClosed : false

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

  const modalSize = ticket.stage === 'backlog' || ticket.stage === 'done' ? 'lg' : 'xl'
  const bodyScroll = ticket.stage !== 'backlog'

  const stageActions: StageActions = { canSendBack, canHandOff, canRefine, isReview, isRunning }
  const advanceState: AdvanceState = { target, label: advanceLabel, blockedReason: advanceBlockedReason }
  const attachHint = agentTab
    ? 'Drop, paste, or click to attach — goes straight to the agent'
    : 'Drop, paste, or click to attach — sent with the next stage'

  return (
    <Modal
      isOpen={!!ticket}
      onClose={onClose}
      title={ticket.title}
      size={modalSize}
      bodyScroll={bodyScroll}
      headerExtra={
        ticket.artifacts.activity.length > 0 ? (
          <div
            className="flex max-w-xs shrink-0 items-center gap-1.5 text-micro text-zinc-500"
            title={ticket.artifacts.activity.map((e) => `${relativeTime(e.at)} — ${e.text}`).join('\n')}
          >
            <History size={11} className="shrink-0 text-zinc-600" />
            <span className="truncate">
              {relativeTime(ticket.artifacts.activity[ticket.artifacts.activity.length - 1].at)} ·{' '}
              {ticket.artifacts.activity[ticket.artifacts.activity.length - 1].text}
            </span>
          </div>
        ) : undefined
      }
      footer={
        <TicketStageFooter
          ticket={ticket}
          showDelete={showDelete}
          onShowDelete={() => setShowDelete(true)}
          onCancelDelete={() => setShowDelete(false)}
          onDelete={handleDelete}
          showReject={showReject}
          rejectReason={rejectReason}
          onRejectReasonChange={setRejectReason}
          onShowReject={() => setShowReject(true)}
          onCancelReject={() => setShowReject(false)}
          onReject={handleReject}
          isDirty={isDirty}
          onSave={handleSave}
          actions={stageActions}
          hasAgentTab={!!agentTab}
          onOpenAgentTab={() => {
            focusTicketTab(ticket)
            onClose()
          }}
          onHandOff={handleHandOff}
          commentDraft={commentDraft}
          onRefine={handleRefine}
          onFinish={handleFinish}
          advance={advanceState}
          onAdvance={handleAdvance}
        />
      }
    >
      {wrapUpOpen && agentTab?.worktree && (
        <CloseWorktreeTabModal tab={agentTab} worktree={agentTab.worktree} onCancel={() => setWrapUpOpen(false)} />
      )}
      <div
        className="flex h-full min-h-0 flex-col gap-3"
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
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{stageLabel(ticket)}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-400">{ticket.agent}</span>
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

          {isLiveStage && <Markdown content={ticket.description} className="text-zinc-400" />}
        </div>

        {ticket.stage === 'backlog' && (
          <BacklogBody
            draft={draft}
            onDraftChange={setDraft}
            onSave={handleSave}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onAttachClick={() => fileInputRef.current?.click()}
            isDragging={isDragging}
          />
        )}

        {ticket.stage === 'planning' && (
          <PlanningBody
            ticket={ticket}
            commentDraft={commentDraft}
            onCommentDraftChange={setCommentDraft}
            onSubmitComment={handleRefine}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onAttachClick={() => fileInputRef.current?.click()}
            isDragging={isDragging}
            attachHint={attachHint}
          />
        )}

        {ticket.stage === 'implementing' && (
          <ImplementingBody
            ticket={ticket}
            commentDraft={commentDraft}
            onCommentDraftChange={setCommentDraft}
            onSubmitComment={handleRefine}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onAttachClick={() => fileInputRef.current?.click()}
            isDragging={isDragging}
            attachHint={attachHint}
          />
        )}

        {ticket.stage === 'review' && (
          <ReviewBody
            ticket={ticket}
            commentDraft={commentDraft}
            onCommentDraftChange={setCommentDraft}
            onSubmitComment={handleRefine}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onAttachClick={() => fileInputRef.current?.click()}
            isDragging={isDragging}
            attachHint={attachHint}
          />
        )}

        {ticket.stage === 'done' && <DoneBody ticket={ticket} />}

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
    </Modal>
  )
}
