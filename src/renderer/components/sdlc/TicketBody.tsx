import { ExternalLink, GitPullRequest } from 'lucide-react'
import { AttachmentChip, AttachmentDropZone, CommentThread } from '@/components/sdlc/TicketStageParts'
import { TicketPanels } from '@/components/sdlc/TicketPanels'
import { BacklogBody } from '@/components/sdlc/stages/BacklogBody'
import type { SdlcColumn, SdlcColumnLayout } from '@/models/sdlc-flow'
import type { SdlcAttachment, SdlcTicket } from '@/models/sdlc'

export interface TicketFormProps {
  draft: string
  onDraftChange: (value: string) => void
  onSave: () => void
}

export interface TicketThreadProps {
  commentDraft: string
  onCommentDraftChange: (value: string) => void
  onSubmitComment: () => void
  attachHint: string
}

export interface TicketFilesProps {
  attachments: SdlcAttachment[]
  onRemoveAttachment: (id: string) => void
  onAttachClick: () => void
  isDragging: boolean
}

interface TicketBodyProps {
  ticket: SdlcTicket
  column: SdlcColumn
  layout: SdlcColumnLayout
  form: TicketFormProps
  thread: TicketThreadProps
  files: TicketFilesProps
}

function Stat({ value, label, className }: { value: string; label: string; className: string }): React.ReactElement {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-center">
      <div className={`text-lg font-semibold ${className}`}>{value}</div>
      <div className="text-micro uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  )
}

function SummaryBody({ ticket, column }: { ticket: SdlcTicket; column: SdlcColumn }): React.ReactElement {
  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(ticket.filesChanged)} label="files" className="text-zinc-200" />
        <Stat value={`+${ticket.linesAdded}`} label="added" className="text-emerald-400" />
        <Stat value={`-${ticket.linesRemoved}`} label="removed" className="text-red-400" />
      </div>

      {ticket.prUrl && (
        <a
          href={ticket.prUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
        >
          <GitPullRequest size={13} className="text-zinc-500" />
          <span className="flex-1 truncate">{ticket.prUrl}</span>
          <ExternalLink size={11} className="text-zinc-600" />
        </a>
      )}

      <TicketPanels ticket={ticket} column={column} />
    </div>
  )
}

function WorkspaceBody({
  ticket,
  column,
  thread,
  files
}: Pick<TicketBodyProps, 'ticket' | 'column' | 'thread' | 'files'>): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 w-1/2 flex-col space-y-3 overflow-y-auto">
        <TicketPanels ticket={ticket} column={column} />
      </div>

      <div className="flex min-h-0 w-1/2 flex-col gap-2 border-l border-zinc-800 pl-4">
        <div className="min-h-0 flex-1">
          <CommentThread
            ticket={ticket}
            draft={thread.commentDraft}
            onDraftChange={thread.onCommentDraftChange}
            onSubmit={thread.onSubmitComment}
          />
        </div>

        {files.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onRemove={() => files.onRemoveAttachment(attachment.id)}
              />
            ))}
          </div>
        )}

        <AttachmentDropZone isDragging={files.isDragging} hint={thread.attachHint} onClick={files.onAttachClick} />
      </div>
    </div>
  )
}

/** One body for every column: the layout comes from where the column sits, the contents from its panel list. */
export function TicketBody({ ticket, column, layout, form, thread, files }: TicketBodyProps): React.ReactElement {
  if (layout === 'form') {
    return (
      <BacklogBody
        draft={form.draft}
        onDraftChange={form.onDraftChange}
        onSave={form.onSave}
        attachments={files.attachments}
        onRemoveAttachment={files.onRemoveAttachment}
        onAttachClick={files.onAttachClick}
        isDragging={files.isDragging}
      />
    )
  }
  if (layout === 'summary') return <SummaryBody ticket={ticket} column={column} />
  return <WorkspaceBody ticket={ticket} column={column} thread={thread} files={files} />
}
