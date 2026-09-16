import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, MessageSquare, Paperclip, RotateCcw, Check, X, ListChecks } from 'lucide-react'
import { Markdown } from '@/components/ui/Markdown'
import type { SdlcCheck, SdlcDiffFile, SdlcDiffLine, SdlcTicket } from '@/models/sdlc'
import { cn } from '@/lib/utils'

export const SECTION_LABEL = 'mb-1.5 flex items-center gap-1.5 text-micro uppercase tracking-wide text-zinc-500'

export function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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

export function DiffList({ files }: { files: SdlcDiffFile[] }): React.ReactElement | null {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  if (files.length === 0) return null

  const allExpanded = files.every((f) => expanded[f.path])

  const toggleAll = (): void => {
    if (allExpanded) {
      setExpanded({})
      return
    }
    setExpanded(Object.fromEntries(files.map((f) => [f.path, true])))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className={cn(SECTION_LABEL, 'mb-0')}>
          <FileText size={11} />
          Changed files ({files.length})
        </div>
        <button
          onClick={toggleAll}
          className="rounded px-1.5 py-0.5 text-micro text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="overflow-hidden rounded border border-zinc-800">
        {files.map((file, index) => (
          <DiffFileRow
            key={file.path}
            file={file}
            isExpanded={!!expanded[file.path]}
            showBorder={index > 0}
            onToggle={() => setExpanded((prev) => ({ ...prev, [file.path]: !prev[file.path] }))}
          />
        ))}
      </div>
    </div>
  )
}

export function CheckBadges({ checks }: { checks: SdlcCheck[] }): React.ReactElement | null {
  if (checks.length === 0) return null
  return (
    <div>
      <div className={SECTION_LABEL}>
        <ListChecks size={11} />
        Checks
      </div>
      <div className="flex flex-wrap gap-1.5">
        {checks.map((check) => (
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
    </div>
  )
}

/** Collapsible reference to the approved plan — used in implementing/review so the diff can be checked against intent. */
export function PlanReferencePanel({ plan }: { plan: string | null }): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  if (!plan) return null
  return (
    <div className="rounded border border-zinc-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-micro uppercase tracking-wide text-zinc-500 hover:bg-zinc-900/60"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <ListChecks size={11} />
        Approved plan
      </button>
      {open && (
        <Markdown
          content={plan}
          className="max-h-48 overflow-auto border-t border-zinc-800 bg-zinc-900/60 px-3 py-2"
        />
      )}
    </div>
  )
}

export function CommentThread({
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

/** Drop/paste/click target for attachments — same shape everywhere, only the hint text changes per stage. */
export function AttachmentDropZone({
  isDragging,
  hint,
  onClick
}: {
  isDragging: boolean
  hint: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-1 rounded border border-dashed px-3 py-3 text-center transition-colors',
        isDragging
          ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
          : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300'
      )}
    >
      <Paperclip size={14} />
      <span className="text-micro leading-snug">{isDragging ? 'Drop to attach' : hint}</span>
    </button>
  )
}

export function AttachmentChip({
  attachment,
  onRemove
}: {
  attachment: SdlcTicket['attachments'][number]
  onRemove: () => void
}): React.ReactElement {
  return (
    <span
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
        onClick={onRemove}
        className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
        title="Remove"
        aria-label={`Remove ${attachment.name}`}
      >
        <X size={10} />
      </button>
    </span>
  )
}
