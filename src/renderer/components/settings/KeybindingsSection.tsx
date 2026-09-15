import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  KEYBINDING_DEFINITIONS,
  effectiveAccelerator,
  reservedAcceleratorReason,
  type KeybindingCategory,
  type KeybindingOverrides
} from '../../../main/models/keybindings'
import { acceleratorFromKeyboardEvent, formatAccelerator } from '@/lib/keybindings'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

const CATEGORIES: KeybindingCategory[] = ['General', 'File', 'View', 'Terminal']

export function KeybindingsSection(): React.ReactElement {
  const [overrides, setOverrides] = useState<KeybindingOverrides>({})
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const accent = useAccent()
  const isMac = useMemo(() => /Mac|iPhone|iPad/.test(navigator.platform), [])

  useEffect(() => {
    let active = true
    void window.api.keybindings.get().then((value) => {
      if (active) setOverrides(value)
    }).catch(() => {
      if (active) setMessage('Could not load keybindings.')
    })
    return () => { active = false }
  }, [])

  const save = async (id: string, accelerator: string): Promise<void> => {
    const reservedFor = reservedAcceleratorReason(accelerator)
    if (reservedFor) {
      setMessage(`Reserved for “${reservedFor}”.`)
      return
    }
    const conflict = KEYBINDING_DEFINITIONS.find(
      (definition) => definition.id !== id && accelerator &&
        effectiveAccelerator(definition.id, overrides)?.toLowerCase() === accelerator.toLowerCase()
    )
    try {
      const definition = KEYBINDING_DEFINITIONS.find((item) => item.id === id)
      const value = accelerator === definition?.defaultAccelerator ? null : accelerator
      setOverrides(await window.api.keybindings.set(id, value))
      setMessage(
        conflict
          ? `Reassigned from “${conflict.label}”; that command is now unassigned.`
          : accelerator ? 'Keybinding updated.' : 'Keybinding disabled.'
      )
      setRecordingId(null)
    } catch {
      setMessage('Could not save that keybinding.')
    }
  }

  const resetOne = async (id: string): Promise<void> => {
    try {
      setOverrides(await window.api.keybindings.set(id, null))
      setMessage('Keybinding reset to its default.')
    } catch {
      setMessage('Could not reset that keybinding.')
    }
  }

  const resetAll = async (): Promise<void> => {
    try {
      setOverrides(await window.api.keybindings.reset())
      setMessage('All keybindings reset to their defaults.')
      setRecordingId(null)
    } catch {
      setMessage('Could not reset keybindings.')
    }
  }

  return (
    <SectionCard
      title="Keyboard shortcuts"
      description="Click a shortcut, then press your preferred key combination. Press Backspace to disable it or Escape to cancel."
    >
      <div className="space-y-5">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
          Hold <span className="font-mono text-zinc-200">{isMac ? '⌘' : 'Ctrl'}</span> to reveal LLM tab numbers,
          then press 1–9 to switch. Hold <span className="font-mono text-zinc-200">{isMac ? '⌥' : 'Alt'}</span> for project numbers.
        </div>
        {CATEGORIES.map((category) => (
          <div key={category}>
            <div className="mb-1 text-meta font-semibold uppercase tracking-wider text-zinc-500">{category}</div>
            <div className="divide-y divide-zinc-800/80 rounded-md border border-zinc-800">
              {KEYBINDING_DEFINITIONS.filter((item) => item.category === category).map((item) => {
                const accelerator = effectiveAccelerator(item.id, overrides)
                const customized = Object.prototype.hasOwnProperty.call(overrides, item.id)
                const recording = recordingId === item.id
                return (
                  <div key={item.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 text-xs text-zinc-300">{item.label}</span>
                    {customized && (
                      <button
                        type="button"
                        aria-label={`Reset ${item.label}`}
                        title="Reset to default"
                        onClick={() => void resetOne(item.id)}
                        className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Change ${item.label}`}
                      aria-pressed={recording}
                      onClick={() => { setMessage(null); setRecordingId(item.id) }}
                      onBlur={() => setRecordingId((current) => current === item.id ? null : current)}
                      onKeyDown={(event) => {
                        if (!recording) return
                        event.preventDefault()
                        event.stopPropagation()
                        if (event.key === 'Escape') {
                          setRecordingId(null)
                          setMessage(null)
                          return
                        }
                        if (event.key === 'Backspace' || event.key === 'Delete') {
                          void save(item.id, '')
                          return
                        }
                        const next = acceleratorFromKeyboardEvent(event.nativeEvent, isMac)
                        if (next) void save(item.id, next)
                        else setMessage('Use a modifier such as Command, Ctrl, or Alt.')
                      }}
                      style={recording ? { borderColor: accent, color: accent } : undefined}
                      className={cn(
                        'min-w-24 rounded border bg-zinc-950 px-2.5 py-1.5 text-center font-mono text-xs outline-none transition-colors',
                        recording ? 'ring-1 ring-current' : accelerator
                          ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600'
                          : 'border-dashed border-zinc-800 text-zinc-600 hover:text-zinc-400'
                      )}
                    >
                      {recording ? 'Press keys…' : formatAccelerator(accelerator, isMac)}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="flex min-h-7 items-center justify-between gap-4">
          <span aria-live="polite" className="text-meta text-zinc-500">{message}</span>
          <button
            type="button"
            onClick={() => void resetAll()}
            disabled={Object.keys(overrides).length === 0}
            className="shrink-0 rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset all
          </button>
        </div>
      </div>
    </SectionCard>
  )
}
