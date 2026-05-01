import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Shield, X, Plus } from 'lucide-react'
import {
  readSettings,
  writeSettings,
  toView,
  isCustomized,
  applyPreset,
  matchesPreset,
  addRule,
  removeRule,
  type RuleBucket,
  type ClaudeSettings,
  type PermissionsView,
  DEFAULT_VIEW
} from '@/lib/claude-permissions'
import { usePermissionPresetsStore, type PermissionPreset } from '@/stores/permission-presets-store'

interface Props {
  projectPath: string | undefined
}

const BUCKETS: { key: RuleBucket; label: string; placeholder: string }[] = [
  { key: 'allow', label: 'Allow', placeholder: 'Bash(npm:*)' },
  { key: 'ask', label: 'Ask', placeholder: 'Bash(*)' },
  { key: 'deny', label: 'Deny', placeholder: 'Bash(git push *)' }
]

export function PermissionsButton({ projectPath }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<ClaudeSettings>({})
  const [view, setView] = useState<PermissionsView>(DEFAULT_VIEW)
  const [drafts, setDrafts] = useState<Record<RuleBucket, string>>({ allow: '', ask: '', deny: '' })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const presets = usePermissionPresetsStore((s) => s.presets)

  const refresh = useCallback(async (): Promise<void> => {
    if (!projectPath) {
      setSettings({})
      setView(DEFAULT_VIEW)
      return
    }
    const next = await readSettings(projectPath)
    setSettings(next)
    setView(toView(next))
  }, [projectPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!open) return
    void refresh()
    const onDown = (e: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, refresh])

  const persist = useCallback(
    async (next: ClaudeSettings): Promise<void> => {
      if (!projectPath) return
      setSettings(next)
      setView(toView(next))
      await writeSettings(projectPath, next)
    },
    [projectPath]
  )

  const onApplyPreset = (preset: PermissionPreset): void => {
    void persist(applyPreset(settings, preset))
  }

  const onAdd = (bucket: RuleBucket): void => {
    const value = drafts[bucket]
    if (!value.trim()) return
    void persist(addRule(settings, bucket, value))
    setDrafts((d) => ({ ...d, [bucket]: '' }))
  }

  const onRemove = (bucket: RuleBucket, rule: string): void => {
    void persist(removeRule(settings, bucket, rule))
  }

  const activePreset = useMemo(
    () => presets.find((p) => matchesPreset(view, p)),
    [presets, view]
  )
  const customized = isCustomized(view)
  const disabled = !projectPath

  const shieldStyle = activePreset ? { color: activePreset.color } : undefined
  const dotStyle = activePreset ? { backgroundColor: activePreset.color } : undefined

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
        title={
          activePreset
            ? `Preset: ${activePreset.name} (.claude/settings.local.json)`
            : 'Claude permissions (.claude/settings.local.json)'
        }
      >
        <Shield
          size={13}
          className={!activePreset && customized ? 'text-emerald-400' : !activePreset ? 'text-zinc-400' : ''}
          style={shieldStyle}
        />
        <span className="capitalize">{activePreset ? activePreset.name : view.mode}</span>
        {(activePreset || customized) && (
          <span
            className={'h-1.5 w-1.5 rounded-full ' + (activePreset ? '' : 'bg-emerald-400')}
            style={dotStyle}
          />
        )}
      </button>

      {open && (
        <div className="absolute bottom-7 left-1/2 z-50 flex max-h-[70vh] w-80 -translate-x-1/2 flex-col rounded border border-zinc-700 bg-zinc-900 text-xs shadow-lg">
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Presets</div>
            <div className="mb-3 grid grid-cols-2 gap-1">
              {presets.map((p) => {
                const active = activePreset?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => onApplyPreset(p)}
                    className={
                      'flex items-center gap-2 rounded border px-2 py-1.5 text-left ' +
                      (active
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800')
                    }
                    style={active ? { borderColor: p.color } : undefined}
                    title={`Apply ${p.name} preset`}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </button>
                )
              })}
            </div>

            {BUCKETS.map((b) => {
              const list = view[b.key]
              return (
                <div key={b.key} className="mb-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {b.label} <span className="text-zinc-600">({list.length})</span>
                    </div>
                  </div>
                  {list.length > 0 && (
                    <ul className="mb-1 space-y-0.5">
                      {list.map((rule) => (
                        <li
                          key={rule}
                          className="flex items-center justify-between gap-2 rounded bg-zinc-800/60 px-2 py-1"
                        >
                          <code className="truncate font-mono text-[11px] text-zinc-200">{rule}</code>
                          <button
                            onClick={() => onRemove(b.key, rule)}
                            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                            title={`Remove from ${b.label}`}
                          >
                            <X size={11} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={drafts[b.key]}
                      onChange={(e) => setDrafts((d) => ({ ...d, [b.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onAdd(b.key)
                      }}
                      placeholder={b.placeholder}
                      className="h-6 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-500"
                    />
                    <button
                      onClick={() => onAdd(b.key)}
                      disabled={!drafts[b.key].trim()}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
                      title={`Add to ${b.label}`}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-zinc-800 px-3 py-2 text-[10px] leading-snug text-zinc-500">
            Edits <code className="text-zinc-400">.claude/settings.local.json</code>. Applies to new
            sessions.
          </div>
        </div>
      )}
    </div>
  )
}
