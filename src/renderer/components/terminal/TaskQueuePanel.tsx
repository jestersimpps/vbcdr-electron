import { useRef, useState } from 'react'
import { GitCommit, ListTodo, Pause, Play, X } from 'lucide-react'
import { useQueueStore, type QueueItem } from '@/stores/queue-store'
import { cn } from '@/lib/utils'

interface TaskQueuePanelProps {
  tabId: string | null
}

const EMPTY_ITEMS: QueueItem[] = []

export function TaskQueuePanel({ tabId }: TaskQueuePanelProps): React.ReactElement | null {
  const items = useQueueStore((s) => (tabId ? s.itemsPerTab[tabId] ?? EMPTY_ITEMS : EMPTY_ITEMS))
  const autoRun = useQueueStore((s) => (tabId ? s.autoRunPerTab[tabId] ?? true : true))
  const addItem = useQueueStore((s) => s.addItem)
  const updateItem = useQueueStore((s) => s.updateItem)
  const removeItem = useQueueStore((s) => s.removeItem)
  const setAutoRun = useQueueStore((s) => s.setAutoRun)

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const composerRef = useRef<HTMLInputElement>(null)

  if (!tabId) return null

  const commitDraft = (): void => {
    const text = draft.trim()
    if (!text) {
      setEditingId(null)
      return
    }
    if (editingId) {
      updateItem(tabId, editingId, text)
      setEditingId(null)
    } else {
      addItem(tabId, text)
    }
    setDraft('')
  }

  const handleEditChip = (item: QueueItem): void => {
    if (editingId && draft.trim()) {
      updateItem(tabId, editingId, draft.trim())
    } else if (!editingId && draft.trim()) {
      addItem(tabId, draft.trim())
    }
    setEditingId(item.id)
    setDraft(item.text)
    composerRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Escape' && editingId) {
      e.preventDefault()
      setEditingId(null)
      setDraft('')
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-zinc-800 bg-zinc-950 px-2 py-1.5">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, idx) => {
            const isEditing = editingId === item.id
            const preview = item.text.length > 40 ? `${item.text.slice(0, 40)}…` : item.text
            return (
              <span
                key={item.id}
                className={cn(
                  'group inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  isEditing
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'
                )}
                title={item.text}
              >
                <span className="tabular-nums text-zinc-500">{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => handleEditChip(item)}
                  className="truncate text-left outline-none"
                  style={{ maxWidth: 240 }}
                >
                  {preview}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(tabId, item.id)}
                  className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
                  title="Remove"
                >
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="flex h-7 items-center gap-2">
        <button
          type="button"
          onClick={() => setAutoRun(tabId, !autoRun)}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors',
            autoRun
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
          )}
          title={autoRun ? 'Pause auto-run' : 'Start auto-run'}
        >
          {autoRun ? <Pause size={11} /> : <Play size={11} />}
          Auto
        </button>
        <button
          type="button"
          onClick={() => {
            addItem(tabId, '/commit')
            addItem(tabId, '/clear')
          }}
          className="flex h-7 shrink-0 items-center gap-1 rounded bg-zinc-800 px-2 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          title="Queue /commit then /clear"
        >
          <GitCommit size={11} />
          Commit & Clear
        </button>
        <div className="relative flex-1">
          <ListTodo
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600"
          />
          <input
            ref={composerRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={editingId ? 'Editing task — ↵ to save, Esc to cancel' : 'Queue a task (↵ to add)'}
            className="h-7 w-full rounded border border-zinc-800 bg-zinc-900 py-0 pl-7 pr-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          />
        </div>
        <button
          type="button"
          onClick={commitDraft}
          disabled={!draft.trim()}
          className={cn(
            'h-7 shrink-0 rounded px-3 text-[11px] font-medium transition-colors',
            editingId
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
            'disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600'
          )}
        >
          {editingId ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
