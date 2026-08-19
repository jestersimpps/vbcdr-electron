import { useEffect, useRef, useState } from 'react'
import { Mic, Bot, Check, X, Zap, CornerDownLeft } from 'lucide-react'
import { useAccent } from '@/components/settings/SettingsControls'
import {
  useVoiceStore,
  submitUtterance,
  confirmPending,
  cancelPending
} from '@/services/voice/voice-controller'

export function VoiceHistory(): React.ReactElement {
  const accent = useAccent()
  const history = useVoiceStore((s) => s.history)
  const pending = useVoiceStore((s) => s.pending)
  const awaiting = useVoiceStore((s) => s.awaiting)
  const clear = useVoiceStore((s) => s.clear)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [history.length, pending])

  const submit = (): void => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void submitUtterance(text)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-300">Conversation</span>
        <button
          onClick={clear}
          disabled={history.length === 0}
          className="text-meta text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-30"
        >
          Clear
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {history.length === 0 && (
          <p className="mt-6 text-center text-xs text-zinc-600">
            Type an utterance below to test the pipeline without a microphone.
          </p>
        )}

        {history.map((entry) => (
          <div key={entry.id} className="mb-3 flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <Mic size={12} className="mt-0.5 shrink-0 text-zinc-500" />
              <span className="text-xs text-zinc-300">{entry.transcript}</span>
              {entry.source === 'fast-path' && (
                <Zap size={11} className="mt-0.5 shrink-0" style={{ color: accent }} />
              )}
            </div>

            {entry.action && (
              <div className="flex items-start gap-2 pl-1">
                <Bot size={12} className="mt-0.5 shrink-0 text-zinc-600" />
                <code className="text-meta text-zinc-500">
                  {entry.action.action}
                  {entry.action.target ? ` → ${entry.action.target}` : ''}
                </code>
              </div>
            )}

            <div className="flex items-start gap-2 pl-1">
              {entry.ok ? (
                <Check size={12} className="mt-0.5 shrink-0 text-green-500" />
              ) : (
                <X size={12} className="mt-0.5 shrink-0 text-red-500" />
              )}
              <span className={entry.ok ? 'text-meta text-zinc-400' : 'text-meta text-red-400'}>
                {entry.outcome}
              </span>
            </div>
          </div>
        ))}

        {awaiting && <p className="text-meta text-zinc-600">Waiting for the translator…</p>}
      </div>

      {pending && (
        <div className="border-t border-zinc-800 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-300">
            Confirm <code className="font-medium">{pending.action}</code>
            {pending.target ? ` → ${pending.target}` : ''}?
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              onClick={confirmPending}
              className="rounded border border-amber-500/40 px-2 py-1 text-meta text-amber-200 transition-colors hover:bg-amber-500/20"
            >
              Run it
            </button>
            <button
              onClick={cancelPending}
              className="rounded border border-zinc-700 px-2 py-1 text-meta text-zinc-400 transition-colors hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2">
        <input
          type="text"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder='Try "go to the petsitters project"'
          className="w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-30"
          title="Send utterance"
        >
          <CornerDownLeft size={13} />
        </button>
      </div>
    </div>
  )
}
