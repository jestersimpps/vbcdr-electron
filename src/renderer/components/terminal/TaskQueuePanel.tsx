import { useRef, useState } from 'react'
import { GitCommit, ListTodo, Pause, Play, X } from 'lucide-react'
import { useQueueStore, type QueueItem } from '@/stores/queue-store'
import { cn } from '@/lib/utils'
import { ToolbarButton } from '@/components/ui/ToolbarButton'

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
                  'group inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-meta transition-colors',
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
        <ToolbarButton
          variant={autoRun ? 'accent' : 'default'}
          onClick={() => setAutoRun(tabId, !autoRun)}
          title={autoRun ? 'Pause auto-run' : 'Start auto-run'}
        >
          {autoRun ? <Pause size={10} /> : <Play size={10} />}
          Auto
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            addItem(tabId, '/commit')
            addItem(tabId, '/clear')
          }}
          title="Queue /commit then /clear"
        >
          <GitCommit size={11} />
          Commit & Clear
        </ToolbarButton>
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
            className="h-7 w-full rounded border border-zinc-800 bg-zinc-900 py-0 pl-7 pr-2 text-[11px] leading-[1.4] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          />
        </div>
        <ToolbarButton
          variant={editingId ? 'accentActive' : 'default'}
          onClick={commitDraft}
          disabled={!draft.trim()}
        >
          {editingId ? 'Save' : 'Add'}
        </ToolbarButton>
      </div>
    </div>
  )
}
