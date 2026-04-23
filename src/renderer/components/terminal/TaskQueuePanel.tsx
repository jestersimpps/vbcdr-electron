import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ListTodo, Pause, Pencil, Play, Trash2, X } from 'lucide-react'
import { useQueueStore, type QueueItem } from '@/stores/queue-store'
import { cn } from '@/lib/utils'

interface TaskQueuePanelProps {
  projectId: string | null
}

export function TaskQueuePanel({ projectId }: TaskQueuePanelProps): React.ReactElement | null {
  const items = useQueueStore((s) => (projectId ? s.itemsPerProject[projectId] ?? [] : []))
  const autoRun = useQueueStore((s) => (projectId ? s.autoRunPerProject[projectId] ?? false : false))
  const open = useQueueStore((s) => (projectId ? s.panelOpenPerProject[projectId] ?? false : false))
  const { addItem, updateItem, removeItem, clear, setAutoRun, setPanelOpen } = useQueueStore()

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && projectId) {
      setTimeout(() => composerRef.current?.focus(), 50)
    }
  }, [open, projectId])

  if (!projectId) return null

  const handleAdd = (): void => {
    if (!projectId) return
    const text = draft.trim()
    if (!text) return
    addItem(projectId, text)
    setDraft('')
  }

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  const handleStartEdit = (item: QueueItem): void => {
    setEditingId(item.id)
    setEditDraft(item.text)
  }

  const handleCommitEdit = (): void => {
    if (!editingId) return
    updateItem(projectId, editingId, editDraft)
    setEditingId(null)
    setEditDraft('')
  }

  const handleCancelEdit = (): void => {
    setEditingId(null)
    setEditDraft('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleCommitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const count = items.length

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(projectId, !open)}
        className={cn(
          'flex w-full items-center gap-2 border-t border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs',
          'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 transition-colors'
        )}
        title={open ? 'Collapse queue' : 'Expand queue'}
      >
        <ListTodo size={12} className={autoRun ? 'text-emerald-400' : 'text-zinc-400'} />
        <span className="font-medium">Queue</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-300">
          {count}
        </span>
        {autoRun && (
          <span className="text-[10px] text-emerald-400">auto-run on</span>
        )}
        <span className="flex-1" />
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      <div
        className={cn(
          'absolute inset-x-0 bottom-6 z-20 flex flex-col overflow-hidden border-t border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur transition-transform duration-200',
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        )}
        style={{ maxHeight: '60%' }}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
          <ListTodo size={13} className="text-zinc-400" />
          <span className="text-xs font-medium text-zinc-200">Task queue</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-300">
            {count}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setAutoRun(projectId, !autoRun)}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              autoRun
                ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            )}
            title={autoRun ? 'Pause auto-run' : 'Start auto-run'}
          >
            {autoRun ? <Pause size={11} /> : <Play size={11} />}
            {autoRun ? 'Auto-run on' : 'Auto-run off'}
          </button>
          <button
            type="button"
            onClick={() => clear(projectId)}
            disabled={count === 0}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-30"
            title="Clear all"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen(projectId, false)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="Close"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {count === 0 ? (
            <div className="py-6 text-center text-[11px] text-zinc-600">
              No queued tasks. Add one below.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item, idx) => {
                const isEditing = editingId === item.id
                return (
                  <li
                    key={item.id}
                    className="group flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5"
                  >
                    <span className="mt-0.5 w-5 shrink-0 text-center text-[10px] tabular-nums text-zinc-500">
                      {idx + 1}
                    </span>
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={handleCommitEdit}
                        rows={Math.min(6, Math.max(2, editDraft.split('\n').length))}
                        className="flex-1 resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="flex-1 whitespace-pre-wrap break-words text-left text-xs text-zinc-300 hover:text-zinc-100"
                        title="Click to edit"
                      >
                        {item.text}
                      </button>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {isEditing ? (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleCancelEdit()
                          }}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          title="Cancel edit (Esc)"
                        >
                          <X size={12} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(projectId, item.id)}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-zinc-800 bg-zinc-900/60 px-2 py-2">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Add a prompt to the queue (⌘↵ to add, Shift+↵ for newline)"
            rows={Math.min(5, Math.max(2, draft.split('\n').length))}
            className="flex-1 resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            Add
          </button>
        </div>
      </div>
    </>
  )
}
