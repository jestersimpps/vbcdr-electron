import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { attachmentPathInWorktree } from '@/lib/sdlc-attachments'
import type { SdlcAttachment, SdlcTicket } from '@/models/sdlc'

/** Persisted tickets lose their image bytes, so the thumbnail falls back to the copy written into the worktree. */
function useThumbnail(attachment: SdlcAttachment, filePath: string | null): string | null {
  const [loaded, setLoaded] = useState<string | null>(null)
  const needsLoad = attachment.kind === 'image' && !attachment.dataUrl && !!filePath

  useEffect(() => {
    if (!needsLoad || !filePath) return
    let cancelled = false
    window.api.fs
      .readImageAsDataUrl(filePath)
      .then((dataUrl) => {
        if (!cancelled) setLoaded(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setLoaded(null)
      })
    return () => {
      cancelled = true
    }
  }, [needsLoad, filePath])

  if (attachment.kind !== 'image') return null
  return attachment.dataUrl ?? loaded
}

function AttachmentChip({
  attachment,
  worktreePath
}: {
  attachment: SdlcAttachment
  worktreePath: string | null
}): React.ReactElement {
  const filePath = worktreePath ? attachmentPathInWorktree(worktreePath, attachment) : null
  const thumbnail = useThumbnail(attachment, filePath)

  return (
    <button
      onClick={() => filePath && void window.api.fs.openFolder(filePath)}
      disabled={!filePath}
      className="flex max-w-full items-center gap-1 rounded border border-zinc-800 py-0.5 pl-0.5 pr-1 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-default disabled:hover:border-zinc-800 disabled:hover:bg-transparent"
      title={filePath ? `Open ${attachment.name}` : attachment.name}
      aria-label={`Open ${attachment.name}`}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover" />
      ) : (
        <FileText size={11} className="mx-0.5 shrink-0 text-zinc-500" />
      )}
      <span className="max-w-[120px] truncate text-micro text-zinc-400">{attachment.name}</span>
    </button>
  )
}

export function TicketAttachments({ ticket }: { ticket: SdlcTicket }): React.ReactElement | null {
  if (ticket.attachments.length === 0) return null
  const worktreePath = ticket.worktreePath === '—' ? null : ticket.worktreePath
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {ticket.attachments.map((attachment) => (
        <AttachmentChip key={attachment.id} attachment={attachment} worktreePath={worktreePath} />
      ))}
    </div>
  )
}
