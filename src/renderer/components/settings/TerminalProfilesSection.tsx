import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Star, Terminal, Trash2 } from 'lucide-react'
import { useLayoutStore } from '@/stores/layout-store'
import { LLM_PROVIDERS } from '@/config/llm-provider-registry'
import {
  BUILTIN_PROFILE_IDS,
  PROFILE_COLOR_PRESETS,
  DEFAULT_BUILTIN_PROFILE_COLORS,
  isValidHexColor,
  type BuiltinProfileId,
  type CustomTerminalProfile
} from '@/config/terminal-profiles'
import { SectionCard } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

function ColorPicker({
  value,
  onChange,
  label
}: {
  value: string
  onChange: (color: string) => void
  label: string
}): React.ReactElement {
  const colorRef = useRef<HTMLInputElement>(null)
  const [hexDraft, setHexDraft] = useState(value)

  useEffect(() => {
    setHexDraft(value)
  }, [value])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PROFILE_COLOR_PRESETS.map((preset) => {
        const active = preset.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-label={`${label}: use ${preset}`}
            aria-pressed={active}
            className={cn(
              'h-5 w-5 rounded-full transition-transform hover:scale-110',
              active ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-zinc-900' : 'ring-1 ring-inset ring-white/10'
            )}
            style={{ backgroundColor: preset }}
          />
        )
      })}
      <div
        className="relative ml-1 flex h-6 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-1.5"
        title="Pick any color"
      >
        <button
          type="button"
          onClick={() => colorRef.current?.click()}
          aria-label={`${label}: open color picker`}
          className="h-3.5 w-3.5 rounded-sm ring-1 ring-inset ring-white/20"
          style={{ backgroundColor: isValidHexColor(value) ? value : '#888888' }}
        />
        <input
          ref={colorRef}
          type="color"
          aria-label={`${label} color picker`}
          value={isValidHexColor(value) ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          tabIndex={-1}
        />
        <input
          type="text"
          aria-label={`${label} hex value`}
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value
            setHexDraft(v)
            if (isValidHexColor(v)) onChange(v)
          }}
          onBlur={() => setHexDraft(value)}
          className="relative z-10 w-16 bg-transparent font-mono text-xs text-zinc-300 outline-none"
        />
      </div>
    </div>
  )
}

function ProfilePreview({ label, color }: { label: string; color: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-6 w-6 items-center justify-center rounded"
        style={{ color, backgroundColor: `${color}1f` }}
        aria-hidden
      >
        <Plus size={13} />
      </span>
      <span
        className="rounded-t-md px-3 py-1 text-xs"
        style={{ color, backgroundColor: `${color}1f`, boxShadow: `inset 0 2px 0 0 ${color}` }}
        aria-hidden
      >
        {label}
      </span>
    </div>
  )
}

function BuiltinProfileRow({ id }: { id: BuiltinProfileId }): React.ReactElement {
  const color = useLayoutStore((s) => s.builtinProfileColors[id])
  const setColor = useLayoutStore((s) => s.setBuiltinProfileColor)
  const removeBuiltinProfile = useLayoutStore((s) => s.removeBuiltinProfile)
  const defaultTerminalProfileId = useLayoutStore((s) => s.defaultTerminalProfileId)
  const setDefaultTerminalProfileId = useLayoutStore((s) => s.setDefaultTerminalProfileId)
  const provider = LLM_PROVIDERS[id]
  const isDefault = color === DEFAULT_BUILTIN_PROFILE_COLORS[id]

  return (
    <div className="space-y-2.5 rounded border border-zinc-800 bg-zinc-900/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProfilePreview label={provider.label} color={color} />
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">Runs: {provider.command}</span>
          <button
            type="button"
            onClick={() => setDefaultTerminalProfileId(id)}
            disabled={defaultTerminalProfileId === id}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-amber-300 disabled:text-amber-400 disabled:opacity-100"
            title={defaultTerminalProfileId === id ? 'Default profile' : 'Make default'}
          >
            <Star size={11} fill={defaultTerminalProfileId === id ? 'currentColor' : 'none'} />
            {defaultTerminalProfileId === id ? 'Default' : 'Make default'}
          </button>
          <button
            type="button"
            onClick={() => setColor(id, DEFAULT_BUILTIN_PROFILE_COLORS[id])}
            disabled={isDefault}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200 disabled:opacity-40"
            title="Reset color"
          >
            <RotateCcw size={11} />
            Reset
          </button>
          <button
            type="button"
            onClick={() => removeBuiltinProfile(id)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-red-300"
            title={`Remove ${provider.label} profile`}
          >
            <Trash2 size={11} />
            Remove
          </button>
        </div>
      </div>
      <ColorPicker value={color} onChange={(c) => setColor(id, c)} label={`${provider.label} color`} />
    </div>
  )
}

function CustomProfileRow({ profile }: { profile: CustomTerminalProfile }): React.ReactElement {
  const updateCustomProfile = useLayoutStore((s) => s.updateCustomProfile)
  const removeCustomProfile = useLayoutStore((s) => s.removeCustomProfile)
  const defaultTerminalProfileId = useLayoutStore((s) => s.defaultTerminalProfileId)
  const setDefaultTerminalProfileId = useLayoutStore((s) => s.setDefaultTerminalProfileId)
  const [labelDraft, setLabelDraft] = useState(profile.label)
  const [commandDraft, setCommandDraft] = useState(profile.command)

  useEffect(() => setLabelDraft(profile.label), [profile.label])
  useEffect(() => setCommandDraft(profile.command), [profile.command])

  const commitLabel = (raw: string): void => {
    if (raw.trim()) updateCustomProfile(profile.id, { label: raw })
    else setLabelDraft(profile.label)
  }
  const commitCommand = (raw: string): void => updateCustomProfile(profile.id, { command: raw })
  const remove = (): void => {
    if (profile.command && !window.confirm(`Remove the “${profile.label}” terminal profile?`)) return
    removeCustomProfile(profile.id)
  }

  return (
    <div className="space-y-2.5 rounded border border-zinc-800 bg-zinc-900/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProfilePreview label={profile.label} color={profile.color} />
        <div className="flex items-center gap-2">
          {profile.command ? (
            <span className="text-xs text-zinc-500">Shown in the tab bar</span>
          ) : (
            <span className="text-xs text-zinc-600">Add a start command to show its + button</span>
          )}
          <button
            type="button"
            onClick={() => setDefaultTerminalProfileId(profile.id)}
            disabled={!profile.command || defaultTerminalProfileId === profile.id}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-amber-300 disabled:opacity-40"
            title={!profile.command ? 'Add a start command first' : defaultTerminalProfileId === profile.id ? 'Default profile' : 'Make default'}
          >
            <Star size={11} fill={defaultTerminalProfileId === profile.id ? 'currentColor' : 'none'} />
            {defaultTerminalProfileId === profile.id ? 'Default' : 'Make default'}
          </button>
          <button
            type="button"
            onClick={remove}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-red-300"
            title="Remove profile"
          >
            <Trash2 size={11} />
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="flex flex-col gap-1">
          <span className="text-meta text-zinc-500">Label</span>
          <input
            type="text"
            value={labelDraft}
            maxLength={24}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={(e) => commitLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel((e.target as HTMLInputElement).value)
            }}
            placeholder="Gemini"
            className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-meta text-zinc-500">Start command</span>
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 focus-within:border-zinc-600">
            <Terminal size={13} style={{ color: profile.color }} />
            <input
              type="text"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={commandDraft}
              onChange={(e) => setCommandDraft(e.target.value)}
              onBlur={(e) => commitCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCommand((e.target as HTMLInputElement).value)
              }}
              placeholder="claude --model opus"
              className="w-full bg-transparent font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
        </label>
      </div>

      <ColorPicker
        value={profile.color}
        onChange={(c) => updateCustomProfile(profile.id, { color: c })}
        label={`${profile.label} color`}
      />
    </div>
  )
}

export function TerminalProfilesSection(): React.ReactElement {
  const customProfiles = useLayoutStore((s) => s.customProfiles)
  const hiddenBuiltinProfileIds = useLayoutStore((s) => s.hiddenBuiltinProfileIds)
  const addCustomProfile = useLayoutStore((s) => s.addCustomProfile)
  const restoreBuiltinProfile = useLayoutStore((s) => s.restoreBuiltinProfile)
  const visibleBuiltinProfileIds = BUILTIN_PROFILE_IDS.filter((id) => !hiddenBuiltinProfileIds.includes(id))

  return (
    <SectionCard
      title="Terminal profiles"
      description="Profiles add one-click launch buttons to the LLM terminal tab bar. Their color follows the tab and terminal border."
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-meta font-semibold uppercase tracking-wider text-zinc-500">Built in</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleBuiltinProfileIds.map((id) => (
              <BuiltinProfileRow key={id} id={id} />
            ))}
          </div>
          {visibleBuiltinProfileIds.length === 0 && (
            <div className="rounded border border-dashed border-zinc-800 px-4 py-5 text-center text-xs text-zinc-600">
              No built-in profiles are shown in the terminal bar.
            </div>
          )}
          {hiddenBuiltinProfileIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-zinc-600">Removed:</span>
              {hiddenBuiltinProfileIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => restoreBuiltinProfile(id)}
                  className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                >
                  Restore {LLM_PROVIDERS[id].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-meta font-semibold uppercase tracking-wider text-zinc-500">Custom</p>
              <p className="mt-0.5 text-xs text-zinc-600">Add profiles for models, flags, or other terminal-based assistants.</p>
            </div>
            <button
              type="button"
              onClick={addCustomProfile}
              className="flex shrink-0 items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              <Plus size={12} />
              Add profile
            </button>
          </div>
          {customProfiles.length === 0 ? (
            <div className="rounded border border-dashed border-zinc-800 px-4 py-5 text-center text-xs text-zinc-600">
              No custom profiles yet.
            </div>
          ) : (
            <div className="space-y-3">
              {customProfiles.map((profile) => (
                <CustomProfileRow key={profile.id} profile={profile} />
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          A custom command that starts with <span className="font-mono">claude</span> or{' '}
          <span className="font-mono">codex</span> keeps that assistant&apos;s extras (usage, sessions, clear
          context) in its tabs.
        </p>
      </div>
    </SectionCard>
  )
}
