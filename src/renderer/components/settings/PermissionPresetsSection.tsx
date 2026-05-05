import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  usePermissionPresetsStore,
  PRESET_COLORS,
  MAX_PRESETS,
  type PermissionPreset
} from '@/stores/permission-presets-store'
import { PROFILE_LIBRARY } from '@/config/permission-profile-library'
import type { RuleBucket } from '@/lib/claude-permissions'

const BUCKETS: { key: RuleBucket; label: string; placeholder: string }[] = [
  { key: 'allow', label: 'Allow', placeholder: 'Bash(npm:*)' },
  { key: 'ask', label: 'Ask', placeholder: 'Bash(*)' },
  { key: 'deny', label: 'Deny', placeholder: 'Bash(git push *)' }
]

export function PermissionPresetsSection(): React.ReactElement {
  const presets = usePermissionPresetsStore((s) => s.presets)
  const addPreset = usePermissionPresetsStore((s) => s.addPreset)
  const [addPickerOpen, setAddPickerOpen] = useState(false)

  const onAdd = (templateId: string): void => {
    addPreset(templateId)
    setAddPickerOpen(false)
  }
  const atLimit = presets.length >= MAX_PRESETS

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">Permission presets</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          One-click bundles of mode + Allow/Ask/Deny rules. Apply them from the shield button next to
          the terminal search bar. Pick a profile to seed each card from the community library.
        </p>
      </div>
      <div className="space-y-3">
        {presets.map((p) => (
          <PresetCard key={p.id} preset={p} />
        ))}
      </div>
      <div className="relative mt-4">
        <button
          onClick={() => setAddPickerOpen((v) => !v)}
          disabled={atLimit}
          className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
          title={atLimit ? `Up to ${MAX_PRESETS} presets` : 'Add a preset from the library'}
        >
          <Plus size={12} />
          Add preset
        </button>
        {addPickerOpen && !atLimit && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAddPickerOpen(false)} />
            <div className="absolute left-0 top-9 z-20 w-72 rounded border border-zinc-700 bg-zinc-900 p-1 shadow-lg">
              {PROFILE_LIBRARY.map((profile) => (
                <button
                  key={profile.templateId}
                  onClick={() => onAdd(profile.templateId)}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-800"
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: profile.color }}
                  />
                  <span className="flex-1">
                    <span className="block text-zinc-200">{profile.name}</span>
                    <span className="block text-micro text-zinc-500">{profile.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function PresetCard({ preset }: { preset: PermissionPreset }): React.ReactElement {
  const update = usePermissionPresetsStore((s) => s.updatePreset)
  const reset = usePermissionPresetsStore((s) => s.resetPreset)
  const loadFromTemplate = usePermissionPresetsStore((s) => s.loadFromTemplate)
  const removePreset = usePermissionPresetsStore((s) => s.removePreset)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<RuleBucket, string>>({ allow: '', ask: '', deny: '' })
  const [pickerOpen, setPickerOpen] = useState(false)
  const profileSourceId = useMemo(
    () => (PROFILE_LIBRARY.find((p) => p.templateId === preset.templateId) ? preset.templateId : ''),
    [preset.templateId]
  )

  const setColor = (color: string): void => {
    update(preset.id, { color })
    setPickerOpen(false)
  }
  const setName = (name: string): void => update(preset.id, { name })
  const onPickProfile = (templateId: string): void => {
    if (!templateId) return
    loadFromTemplate(preset.id, templateId)
  }
  const addRule = (bucket: RuleBucket): void => {
    const value = drafts[bucket].trim()
    if (!value) return
    if (preset[bucket].includes(value)) return
    update(preset.id, { [bucket]: [...preset[bucket], value] })
    setDrafts((d) => ({ ...d, [bucket]: '' }))
  }
  const removeRule = (bucket: RuleBucket, rule: string): void => {
    update(preset.id, { [bucket]: preset[bucket].filter((r) => r !== rule) })
  }

  return (
    <div
      className="rounded border border-zinc-800 bg-zinc-900/40"
      style={{ borderLeft: `3px solid ${preset.color}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="h-4 w-4 rounded-sm border border-zinc-700 transition-transform hover:scale-110"
            style={{ backgroundColor: preset.color }}
            title="Change color"
          />
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 top-6 z-20 grid grid-cols-4 gap-1 rounded border border-zinc-700 bg-zinc-900 p-2 shadow-lg">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-5 w-5 rounded-sm border border-zinc-700 hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <input
          type="text"
          value={preset.name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-zinc-200 outline-none hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-800"
        />
        <select
          value={profileSourceId}
          onChange={(e) => onPickProfile(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 outline-none focus:border-zinc-500"
          title="Load from profile library"
        >
          {!profileSourceId && (
            <option value="" disabled>
              Custom
            </option>
          )}
          {PROFILE_LIBRARY.map((p) => (
            <option key={p.templateId} value={p.templateId}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-micro uppercase tracking-wide text-zinc-500" title="Mode">
          {preset.mode}
        </span>
        <div className="flex items-center gap-1 text-micro text-zinc-500">
          <span title="Allow">{preset.allow.length}</span>
          <span className="text-zinc-700">·</span>
          <span title="Ask">{preset.ask.length}</span>
          <span className="text-zinc-700">·</span>
          <span title="Deny">{preset.deny.length}</span>
        </div>
        <button
          onClick={() => reset(preset.id)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="Reset to profile defaults"
        >
          <RotateCcw size={12} />
        </button>
        <button
          onClick={() => removePreset(preset.id)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-300"
          title="Remove preset"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-zinc-800 px-3 py-3">
          {BUCKETS.map((b) => {
            const list = preset[b.key]
            return (
              <div key={b.key}>
                <div className="mb-1 text-micro uppercase tracking-wide text-zinc-500">
                  {b.label} <span className="text-zinc-600">({list.length})</span>
                </div>
                {list.length > 0 && (
                  <ul className="mb-1 space-y-0.5">
                    {list.map((rule) => (
                      <li
                        key={rule}
                        className="flex items-center justify-between gap-2 rounded bg-zinc-800/60 px-2 py-1"
                      >
                        <code className="truncate font-mono text-meta text-zinc-200">{rule}</code>
                        <button
                          onClick={() => removeRule(b.key, rule)}
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
                      if (e.key === 'Enter') addRule(b.key)
                    }}
                    placeholder={b.placeholder}
                    className="h-6 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 font-mono text-meta text-zinc-200 outline-none focus:border-zinc-500"
                  />
                  <button
                    onClick={() => addRule(b.key)}
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
      )}
    </div>
  )
}
