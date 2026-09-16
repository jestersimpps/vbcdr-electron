import { GitBranch } from 'lucide-react'
import { branchNameFrom } from '@/stores/sdlc-store'
import { AttachmentChip, AttachmentDropZone } from '@/components/sdlc/TicketStageParts'
import type { SdlcAttachment } from '@/models/sdlc'
import { cn } from '@/lib/utils'

interface BacklogBodyProps {
  draft: string
  onDraftChange: (value: string) => void
  onSave: () => void
  attachments: SdlcAttachment[]
  onRemoveAttachment: (id: string) => void
  onAttachClick: () => void
  isDragging: boolean
}

export function BacklogBody({
  draft,
  onDraftChange,
  onSave,
  attachments,
  onRemoveAttachment,
  onAttachClick,
  isDragging
}: BacklogBodyProps): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative min-h-0 flex-1">
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave()
          }}
          className={cn(
            'h-full min-h-[7.5rem] w-full resize-none rounded border bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600',
            isDragging ? 'border-indigo-500' : 'border-zinc-700 focus:border-zinc-500'
          )}
        />
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-indigo-950/40 text-xs font-medium text-indigo-300">
            Drop to attach
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemoveAttachment(attachment.id)}
            />
          ))}
        </div>
      )}

      <AttachmentDropZone
        isDragging={isDragging}
        hint="Drop, paste, or click to attach — sent with the ticket"
        onClick={onAttachClick}
      />

      <div className="flex min-w-0 items-center gap-1.5 text-micro text-zinc-600">
        <GitBranch size={11} className="shrink-0" />
        <span className="shrink-0">will branch as</span>
        <span className="truncate rounded bg-green-400/15 px-1.5 py-px font-mono font-medium text-green-400">
          {branchNameFrom(draft)}
        </span>
      </div>
    </div>
  )
}
