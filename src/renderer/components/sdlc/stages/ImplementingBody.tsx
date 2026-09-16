import { Terminal } from 'lucide-react'
import {
  AttachmentChip,
  AttachmentDropZone,
  CheckBadges,
  CommentThread,
  DiffList,
  PlanReferencePanel,
  SECTION_LABEL
} from '@/components/sdlc/TicketStageParts'
import type { SdlcAttachment, SdlcTicket } from '@/models/sdlc'

interface ImplementingBodyProps {
  ticket: SdlcTicket
  commentDraft: string
  onCommentDraftChange: (value: string) => void
  onSubmitComment: () => void
  attachments: SdlcAttachment[]
  onRemoveAttachment: (id: string) => void
  onAttachClick: () => void
  isDragging: boolean
  attachHint: string
}

export function ImplementingBody({
  ticket,
  commentDraft,
  onCommentDraftChange,
  onSubmitComment,
  attachments,
  onRemoveAttachment,
  onAttachClick,
  isDragging,
  attachHint
}: ImplementingBodyProps): React.ReactElement {
  const { checkOutput, diffFiles, plan } = ticket.artifacts
  const hasContent = diffFiles.length > 0 || ticket.checks.length > 0

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 w-1/2 flex-col space-y-3 overflow-y-auto">
        <PlanReferencePanel plan={plan} />
        <CheckBadges checks={ticket.checks} />
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
        <DiffList files={diffFiles} />
        {!hasContent && (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
            No changes written yet.
          </div>
        )}
      </div>

      <div className="flex min-h-0 w-1/2 flex-col gap-2 border-l border-zinc-800 pl-4">
        <div className="min-h-0 flex-1">
          <CommentThread
            ticket={ticket}
            draft={commentDraft}
            onDraftChange={onCommentDraftChange}
            onSubmit={onSubmitComment}
          />
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <AttachmentChip key={attachment.id} attachment={attachment} onRemove={() => onRemoveAttachment(attachment.id)} />
            ))}
          </div>
        )}

        <AttachmentDropZone isDragging={isDragging} hint={attachHint} onClick={onAttachClick} />
      </div>
    </div>
  )
}
