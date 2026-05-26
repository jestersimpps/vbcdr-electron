import { useEffect, useState } from 'react'
import { X, History, MessageSquare, Loader2 } from 'lucide-react'

interface SessionSummary {
  id: string
  mtime: number
  turnCount: number
  firstUserMessage: string
  firstUserTimestamp: string | null
}

interface SessionHistoryModalProps {
  projectPath: string
  projectName: string
  onClose: () => void
  onResume: (sessionId: string) => void
}

function formatWhen(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today · ${time}`
  if (isYesterday) return `Yesterday · ${time}`
  const date = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  return `${date} · ${time}`
}

export function SessionHistoryModal({
  projectPath,
  projectName,
  onClose,
  onResume
}: SessionHistoryModalProps): React.ReactElement {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSessions(null)
    setError(null)
    window.api.claude
      .listSessions(projectPath)
      .then((rows) => {
        if (!cancelled) setSessions(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return (): void => {
      cancelled = true
    }
  }, [projectPath])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return (): void => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        style={{ width: '70vw', height: '80vh', maxWidth: 900, maxHeight: 760 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-zinc-200">
            <History size={14} className="text-zinc-400" />
            <span className="font-medium">Claude sessions</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400">{projectName}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions === null && !error && (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 size={14} className="animate-spin" />
              Loading sessions…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-red-400">
              {error}
            </div>
          )}
          {sessions && sessions.length === 0 && (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-zinc-500">
              No Claude sessions found for this project yet.
            </div>
          )}
          {sessions && sessions.length > 0 && (
            <ul className="divide-y divide-zinc-800/60">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onResume(s.id)}
                    className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs hover:bg-zinc-800/40"
                    title="Resume in a new terminal tab"
                  >
                    <span className="w-48 shrink-0 whitespace-nowrap text-[11px] text-zinc-500">{formatWhen(s.mtime)}</span>
                    <span className="inline-flex w-16 shrink-0 items-center gap-1 text-[11px] text-zinc-500">
                      <MessageSquare size={10} />
                      {s.turnCount}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-zinc-200" title={s.firstUserMessage}>
                      {s.firstUserMessage || <span className="italic text-zinc-500">(no user message)</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
