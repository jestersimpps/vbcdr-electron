import { useEffect, useRef, useState } from 'react'
import { FileText, GitBranch, Paperclip, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { branchNameFrom, useSdlcStore } from '@/stores/sdlc-store'
import { useProjectStore } from '@/stores/project-store'
import { attachmentsFromFiles } from '@/lib/sdlc-attachments'
import { prepareTicketWorktree } from '@/lib/sdlc-handover'
import { cn } from '@/lib/utils'
import type { SdlcAttachment } from '@/models/sdlc'

interface NewTicketModalProps {
  isOpen: boolean
  projectId: string
  projectName: string
  baseBranch?: string
  onClose: () => void
}

export function NewTicketModal({
  isOpen,
  projectId,
  projectName,
  baseBranch = 'master',
  onClose
}: NewTicketModalProps): React.ReactElement {
  const createTicket = useSdlcStore((s) => s.createTicket)
  const projectPath = useProjectStore((s) => s.projects.find((p) => p.id === projectId)?.path)
  const [defaultBranch, setDefaultBranch] = useState(baseBranch)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<SdlcAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setDescription('')
    setAttachments([])
    setIsDragging(false)
    setAutoAdvance(false)
    const timer = setTimeout(() => textareaRef.current?.focus(), 50)
    return (): void => clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !projectPath) return
    void window.api.git.defaultBranch(projectPath).then(setDefaultBranch)
  }, [isOpen, projectPath])

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    const added = await attachmentsFromFiles(files)
    setAttachments((prev) => [...prev, ...added])
  }

  const canSubmit = description.trim().length > 0

  const handleSubmit = (): void => {
    if (!canSubmit) return
    const ticket = createTicket({ projectId, description, attachments, autoAdvance })
    void prepareTicketWorktree(ticket.id)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`New ticket · ${projectName}`}
      footer={
        <>
          <span className="mr-auto text-micro text-zinc-600">⌘↵ to create</span>
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
          >
            Create ticket
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <div
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
          className="relative"
        >
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files)
              if (files.length) {
                e.preventDefault()
                void addFiles(files)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
            }}
            rows={7}
            placeholder="What should the agent do? Paste a screenshot or drop a file to add context."
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

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 py-1 pl-1 pr-1.5"
              >
                {attachment.kind === 'image' && attachment.dataUrl ? (
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.name}
                    className="h-6 w-6 rounded-sm object-cover"
                  />
                ) : (
                  <FileText size={12} className="mx-1 text-zinc-500" />
                )}
                <span className="max-w-[140px] truncate text-micro text-zinc-400">
                  {attachment.name}
                </span>
                <button
                  onClick={() =>
                    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
                  }
                  className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                  title="Remove"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="mt-px h-3 w-3 shrink-0 accent-indigo-500"
          />
          <span className="min-w-0">
            <span className="block text-xs text-zinc-300">Run stages automatically</span>
            <span className="block text-micro leading-relaxed text-zinc-500">
              Planning, implementing and review hand off without waiting for approval, then the
              ticket is finished: its worktree is removed and the work stays on its branch.
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-micro text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Paperclip size={11} />
            Attach
          </button>
          <div className="flex min-w-0 items-center gap-1.5 text-micro text-zinc-600">
            <GitBranch size={11} className="shrink-0" />
            <span className="shrink-0">worktree on</span>
            <span className="truncate rounded bg-green-400/15 px-1.5 py-px font-mono font-medium text-green-400">
              {branchNameFrom(description)}
            </span>
            <span className="shrink-0">from the latest {defaultBranch}</span>
          </div>
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
    </Modal>
  )
}
