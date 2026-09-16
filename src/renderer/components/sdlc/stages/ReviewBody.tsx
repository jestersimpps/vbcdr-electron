import { FileText } from 'lucide-react'
import { Markdown } from '@/components/ui/Markdown'
import {
  AttachmentChip,
  AttachmentDropZone,
  CheckBadges,
  CommentThread,
  DiffList,
  SECTION_LABEL
} from '@/components/sdlc/TicketStageParts'
import type { SdlcAttachment, SdlcTicket } from '@/models/sdlc'

interface ReviewBodyProps {
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

export function ReviewBody({
  ticket,
  commentDraft,
  onCommentDraftChange,
  onSubmitComment,
  attachments,
  onRemoveAttachment,
  onAttachClick,
  isDragging,
  attachHint
}: ReviewBodyProps): React.ReactElement {
  const { prSummary, diffFiles } = ticket.artifacts

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 w-1/2 flex-col space-y-3 overflow-y-auto">
        {prSummary && (
          <div className="flex min-h-0 flex-col">
            <div className={SECTION_LABEL}>
              <FileText size={11} />
              Summary
            </div>
            <Markdown
              content={prSummary}
              className="min-h-0 overflow-auto rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
            />
          </div>
        )}
        <CheckBadges checks={ticket.checks} />
        <DiffList files={diffFiles} />
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
