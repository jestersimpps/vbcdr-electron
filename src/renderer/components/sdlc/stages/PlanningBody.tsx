import { ListChecks } from 'lucide-react'
import { Markdown } from '@/components/ui/Markdown'
import { AttachmentChip, AttachmentDropZone, CommentThread, SECTION_LABEL } from '@/components/sdlc/TicketStageParts'
import type { SdlcAttachment, SdlcTicket } from '@/models/sdlc'

interface PlanningBodyProps {
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

export function PlanningBody({
  ticket,
  commentDraft,
  onCommentDraftChange,
  onSubmitComment,
  attachments,
  onRemoveAttachment,
  onAttachClick,
  isDragging,
  attachHint
}: PlanningBodyProps): React.ReactElement {
  const { plan } = ticket.artifacts

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 w-1/2 flex-col">
        {plan ? (
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
