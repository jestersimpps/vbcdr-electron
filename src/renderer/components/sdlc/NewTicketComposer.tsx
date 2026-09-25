import { useEffect, useRef, useState } from 'react'
import { FileText, FolderOpen, GitBranch, Paperclip, Plus, X } from 'lucide-react'
import { branchNameFrom, useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { attachmentsFromFiles } from '@/lib/sdlc-attachments'
import { moveTicketOn } from '@/lib/sdlc-handover'
import { cn } from '@/lib/utils'
import type { SdlcAttachment } from '@/models/sdlc'
import type { Project } from '@/models/types'

const GHOST_BUTTON = 'rounded px-1.5 py-1 text-micro text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300'

interface NewTicketComposerProps {
  projects: readonly Project[]
  /** Which project the picker starts on: the one the rest of the app is working in. */
  defaultProjectId?: string | null
}

/**
 * Creating a ticket starts it: there is no approval step anywhere in the flow,
 * so there is nothing to wait for here either. Unless auto-start is off in
 * Settings, and then the ticket waits in the first column for its Start button.
 */
export function NewTicketComposer({ projects, defaultProjectId }: NewTicketComposerProps): React.ReactElement | null {
  const createTicket = useSdlcStore((s) => s.createTicket)
  const autoStart = useSdlcFlowStore((s) => s.autoStart)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [attachments, setAttachments] = useState<SdlcAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (isOpen) textareaRef.current?.focus()
  }, [isOpen])

  // The picker follows the app's project until the user picks another one here,
  // and a project removed under it never leaves the ticket pointing nowhere.
  const chosen = projects.find((p) => p.id === projectId)
  const target = chosen ?? projects.find((p) => p.id === defaultProjectId) ?? projects[0]

  if (!target) return null

  const close = (): void => {
    setIsOpen(false)
    setDescription('')
    setAttachments([])
    setIsDragging(false)
  }

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    const added = await attachmentsFromFiles(files)
    setAttachments((prev) => [...prev, ...added])
  }

  const canSubmit = description.trim().length > 0

  const handleSubmit = (): void => {
    if (!canSubmit) return
    const ticket = createTicket({ projectId: target.id, description, attachments })
    if (autoStart) void moveTicketOn(ticket.id)
    close()
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-zinc-800 px-3 py-2 text-left text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300"
      >
        <Plus size={13} className="shrink-0" />
        New ticket
        <span className="ml-auto flex min-w-0 items-center gap-1 text-micro text-zinc-600">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate">{target.name}</span>
        </span>
      </button>
    )
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 p-2"
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
      <textarea
        ref={textareaRef}
        value={description}
        aria-label="New ticket"
        onChange={(e) => setDescription(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (!files.length) return
          e.preventDefault()
          void addFiles(files)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            handleSubmit()
          }
          if (e.key === 'Escape') close()
        }}
        rows={3}
        placeholder={
          autoStart
            ? 'What should the agents do? Enter starts it, Shift+Enter adds a line. Paste a screenshot to add context.'
            : 'What should the agents do? Enter puts it in the first column, Shift+Enter adds a line. Paste a screenshot to add context.'
        }
        className={cn(
          'w-full resize-none rounded border bg-zinc-950/60 px-2 py-1.5 text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600',
          isDragging ? 'border-indigo-500' : 'border-zinc-800 focus:border-zinc-600'
        )}
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-1 rounded border border-zinc-800 py-0.5 pl-0.5 pr-1">
              {attachment.kind === 'image' && attachment.dataUrl ? (
                <img src={attachment.dataUrl} alt={attachment.name} className="h-5 w-5 rounded-sm object-cover" />
              ) : (
                <FileText size={11} className="mx-0.5 text-zinc-500" />
              )}
              <span className="max-w-[100px] truncate text-micro text-zinc-400">{attachment.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))}
                className="rounded p-0.5 text-zinc-600 hover:text-zinc-300"
                aria-label={`Remove ${attachment.name}`}
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-1 rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-1 text-micro text-zinc-400">
          <FolderOpen size={11} className="shrink-0 text-zinc-500" />
          <select
            value={target.id}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project for the new ticket"
            title={target.path}
            className="max-w-[180px] cursor-pointer truncate bg-transparent outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        {canSubmit && (
          <div className="flex min-w-0 items-center gap-1 text-micro text-zinc-600">
            <GitBranch size={10} className="shrink-0" />
            <span className="truncate font-mono text-green-400/80">{branchNameFrom(description)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => fileInputRef.current?.click()} className={GHOST_BUTTON} title="Attach files" aria-label="Attach files">
          <Paperclip size={11} />
        </button>
        <button onClick={close} className={cn(GHOST_BUTTON, 'ml-auto')}>
          Cancel
        </button>
        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="rounded bg-indigo-600 px-2 py-1 text-micro font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
          title={autoStart ? '↵' : '↵ — auto-start is off, so the ticket waits for its Start button'}
        >
          {autoStart ? 'Start' : 'Add'}
        </button>
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
  )
}
