import { useEffect, useState } from 'react'
import { Palette, Moon, Sun, Pencil, Zap, RotateCcw, Volume2, Play, Sliders, Code, Shield, Terminal, type LucideIcon } from 'lucide-react'
import { useLayoutStore, DEFAULT_TOKEN_CAP, DEFAULT_LLM_STARTUP_COMMAND } from '@/stores/layout-store'
import { useEditorPrefsStore } from '@/stores/editor-prefs-store'
import { useThemeStore } from '@/stores/theme-store'
import { getThemesByCategory, getThemeById, type ThemeDefinition } from '@/config/theme-registry'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import { IDLE_SOUNDS } from '@/config/sound-registry'
import { CustomThemeEditor } from '@/components/theme/CustomThemeEditor'
import { PermissionPresetsSection } from '@/components/settings/PermissionPresetsSection'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

type SettingsTab = 'general' | 'editor' | 'theme' | 'permissions'

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'editor', label: 'Editor', icon: Code },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'permissions', label: 'Permissions', icon: Shield }
]

const TAB_STORAGE_KEY = 'vbcdr-settings-tab'

function loadInitialTab(): SettingsTab {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY)
    if (stored && TABS.some((t) => t.id === stored)) return stored as SettingsTab
  } catch { /* ignore */ }
  return 'general'
}

const TOKEN_CAP_PRESETS: { label: string; value: number }[] = [
  { label: '100k', value: 100_000 },
  { label: '160k', value: 160_000 },
  { label: '200k', value: 200_000 },
  { label: '1M', value: 1_000_000 }
]

const DEFAULT_ACCENT = '#58a6ff'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

function useAccent(): string {
  const themeId = useThemeStore((s) => s.getFullThemeId())
  return getTerminalTheme(themeId).cursor ?? DEFAULT_ACCENT
}

export function Settings(): React.ReactElement {
  const [tab, setTab] = useState<SettingsTab>(loadInitialTab)
  const accent = useAccent()

  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, tab) } catch { /* ignore */ }
  }, [tab])

  return (
    <div className="min-h-full w-full p-6 text-zinc-200">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-zinc-800">
          {TABS.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors -mb-px',
                  active
                    ? 'text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                )}
                style={active ? { borderColor: accent, color: accent } : undefined}
              >
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'general' && (
          <>
            <Section title="LLM">
              <LlmStartupCommandSection />
            </Section>
            <Section title="Limits">
              <TokenCapSection />
            </Section>
            <Section title="Notifications">
              <SoundSection />
            </Section>
          </>
        )}

        {tab === 'editor' && (
          <Section title="Editor">
            <EditorSection />
          </Section>
        )}

        {tab === 'theme' && (
          <Section title="Theme">
            <ThemeSection />
          </Section>
        )}

        {tab === 'permissions' && (
          <Section title="Permissions">
            <PermissionPresetsSection />
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

function SectionCard({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function LlmStartupCommandSection(): React.ReactElement {
  const llmStartupCommand = useLayoutStore((s) => s.llmStartupCommand)
  const setLlmStartupCommand = useLayoutStore((s) => s.setLlmStartupCommand)
  const accent = useAccent()
  const [draft, setDraft] = useState<string>(llmStartupCommand)

  useEffect(() => {
    setDraft(llmStartupCommand)
  }, [llmStartupCommand])

  const commit = (raw: string): void => {
    setLlmStartupCommand(raw)
  }

  return (
    <SectionCard
      title="LLM startup command"
      description="Command run automatically in new LLM terminal tabs (e.g. claude, codex, gemini)."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
          <Terminal size={13} style={{ color: accent }} />
          <input
            type="text"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            }}
            placeholder={DEFAULT_LLM_STARTUP_COMMAND}
            className="w-64 bg-transparent font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={() => {
            setLlmStartupCommand(DEFAULT_LLM_STARTUP_COMMAND)
            setDraft(DEFAULT_LLM_STARTUP_COMMAND)
          }}
          className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
          title="Reset to default"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>
    </SectionCard>
  )
}

function TokenCapSection(): React.ReactElement {
  const tokenCap = useLayoutStore((s) => s.tokenCap)
  const setTokenCap = useLayoutStore((s) => s.setTokenCap)
  const accent = useAccent()
  const [draft, setDraft] = useState<string>(String(tokenCap))

  const commit = (raw: string): void => {
    const parsed = Number(raw.replace(/[,_\s]/g, ''))
    if (Number.isFinite(parsed) && parsed > 0) {
      setTokenCap(parsed)
      setDraft(String(Math.round(parsed)))
    } else {
      setDraft(String(tokenCap))
    }
  }

  return (
    <SectionCard
      title="Token Cap"
      description="Maximum tokens used to calculate the Claude progress bar (per terminal tab)."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
          <Zap size={13} style={{ color: accent }} />
          <input
            type="number"
            min={1}
            step={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            }}
            className="w-32 bg-transparent text-sm tabular-nums text-zinc-200 outline-none"
          />
          <span className="text-xs text-zinc-500">tokens</span>
        </div>
        <div className="flex items-center gap-1">
          {TOKEN_CAP_PRESETS.map((p) => {
            const active = tokenCap === p.value
            return (
              <button
                key={p.value}
                onClick={() => {
                  setTokenCap(p.value)
                  setDraft(String(p.value))
                }}
                className={cn(
                  'rounded border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-transparent text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                )}
                style={active ? { backgroundColor: `${accent}26`, color: accent } : undefined}
              >
                {p.label}
              </button>
            )
          })}
          <button
            onClick={() => {
              setTokenCap(DEFAULT_TOKEN_CAP)
              setDraft(String(DEFAULT_TOKEN_CAP))
            }}
            className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
            title="Reset to default"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Current: <span className="tabular-nums text-zinc-300">{tokenCap.toLocaleString()}</span>{' '}
        ({formatTokens(tokenCap)})
      </p>
    </SectionCard>
  )
}

function EditorSection(): React.ReactElement {
  const minimapEnabled = useEditorPrefsStore((s) => s.minimapEnabled)
  const setMinimapEnabled = useEditorPrefsStore((s) => s.setMinimapEnabled)
  const autosaveEnabled = useEditorPrefsStore((s) => s.autosaveEnabled)
  const setAutosaveEnabled = useEditorPrefsStore((s) => s.setAutosaveEnabled)
  const autosaveDelayMs = useEditorPrefsStore((s) => s.autosaveDelayMs)
  const setAutosaveDelayMs = useEditorPrefsStore((s) => s.setAutosaveDelayMs)
  const fontSize = useEditorPrefsStore((s) => s.fontSize)
  const setFontSize = useEditorPrefsStore((s) => s.setFontSize)
  const tabSize = useEditorPrefsStore((s) => s.tabSize)
  const setTabSize = useEditorPrefsStore((s) => s.setTabSize)
  const bracketPairColorization = useEditorPrefsStore((s) => s.bracketPairColorization)
  const setBracketPairColorization = useEditorPrefsStore((s) => s.setBracketPairColorization)
  const formatOnSave = useEditorPrefsStore((s) => s.formatOnSave)
  const setFormatOnSave = useEditorPrefsStore((s) => s.setFormatOnSave)
  const defaultDiffView = useEditorPrefsStore((s) => s.defaultDiffView)
  const setDefaultDiffView = useEditorPrefsStore((s) => s.setDefaultDiffView)
  const accent = useAccent()

  return (
    <SectionCard title="Editor" description="Code editor preferences.">
      <div className="space-y-3">
        <PrefToggle
          label="Minimap"
          description="Show code minimap on the right edge of the editor."
          enabled={minimapEnabled}
          onToggle={() => setMinimapEnabled(!minimapEnabled)}
          accent={accent}
        />
        <PrefToggle
          label="Bracket pair colorization"
          description="Match matching brackets with the same color."
          enabled={bracketPairColorization}
          onToggle={() => setBracketPairColorization(!bracketPairColorization)}
          accent={accent}
        />
        <PrefToggle
          label="Format on save"
          description="Run Monaco's formatter before saving (supported langs: JS/TS, JSON, HTML, CSS)."
          enabled={formatOnSave}
          onToggle={() => setFormatOnSave(!formatOnSave)}
          accent={accent}
        />
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-200">Default diff view</div>
            <div className="text-[11px] text-zinc-500">
              How the Diff tab opens. The in-panel toggle still works per session.
            </div>
          </div>
          <select
            value={defaultDiffView}
            onChange={(e) => setDefaultDiffView(e.target.value as 'split' | 'inline')}
            className="cursor-pointer rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200 outline-none"
          >
            <option value="split" className="bg-zinc-900">Split</option>
            <option value="inline" className="bg-zinc-900">Inline</option>
          </select>
        </div>
        <PrefToggle
          label="Autosave"
          description={`Save automatically ${autosaveDelayMs}ms after you stop typing.`}
          enabled={autosaveEnabled}
          onToggle={() => setAutosaveEnabled(!autosaveEnabled)}
          accent={accent}
        />
        {autosaveEnabled && (
          <div className="ml-12">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
              <span>Delay</span>
              <span className="tabular-nums text-zinc-400">{autosaveDelayMs}ms</span>
            </div>
            <input
              type="range"
              min={250}
              max={5000}
              step={250}
              value={autosaveDelayMs}
              onChange={(e) => setAutosaveDelayMs(Number(e.target.value))}
              style={{ accentColor: accent }}
              className="h-1 w-full cursor-pointer"
            />
          </div>
        )}
        <div className="border-t border-zinc-800 pt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
            <span>Font size</span>
            <span className="tabular-nums text-zinc-400">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={8}
            max={32}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ accentColor: accent }}
            className="h-1 w-full cursor-pointer"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
            <span>Tab size</span>
            <span className="tabular-nums text-zinc-400">{tabSize} spaces</span>
          </div>
          <div className="flex items-center gap-1">
            {[2, 4, 8].map((n) => {
              const active = tabSize === n
              return (
                <button
                  key={n}
                  onClick={() => setTabSize(n)}
                  className={cn(
                    'rounded border px-2 py-1 text-xs transition-colors',
                    active
                      ? 'border-transparent'
                      : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  )}
                  style={active ? { backgroundColor: `${accent}26`, color: accent } : undefined}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function Toggle({
  enabled,
  onToggle,
  accent,
  ariaLabel
}: {
  enabled: boolean
  onToggle: () => void
  accent: string
  ariaLabel: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={enabled ? { backgroundColor: accent } : undefined}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors',
        'ring-1 ring-inset ring-white/10 hover:ring-white/25',
        'focus-visible:ring-2 focus-visible:ring-white/60',
        enabled ? '' : 'bg-zinc-700/60 hover:bg-zinc-700'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out',
          enabled ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

function PrefToggle({
  label,
  description,
  enabled,
  onToggle,
  accent
}: {
  label: string
  description?: string
  enabled: boolean
  onToggle: () => void
  accent: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 py-1">
      <Toggle enabled={enabled} onToggle={onToggle} accent={accent} ariaLabel={`Toggle ${label}`} />
      <div className="flex flex-col">
        <span className="text-xs text-zinc-300">{label}</span>
        {description && <span className="text-[11px] text-zinc-500">{description}</span>}
      </div>
    </div>
  )
}

function SoundSection(): React.ReactElement {
  const idleSoundEnabled = useLayoutStore((s) => s.idleSoundEnabled)
  const setIdleSoundEnabled = useLayoutStore((s) => s.setIdleSoundEnabled)
  const idleSoundId = useLayoutStore((s) => s.idleSoundId)
  const setIdleSoundId = useLayoutStore((s) => s.setIdleSoundId)
  const accent = useAccent()

  return (
    <SectionCard
      title="Sounds"
      description="Play a sound when an LLM terminal becomes idle."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Toggle
          enabled={idleSoundEnabled}
          onToggle={() => setIdleSoundEnabled(!idleSoundEnabled)}
          accent={accent}
          ariaLabel="Toggle idle sound"
        />
        <span className="text-xs text-zinc-400">Play sound on idle</span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1">
            <Volume2 size={13} style={{ color: idleSoundEnabled ? accent : '#71717a' }} />
            <select
              value={idleSoundId}
              onChange={(e) => setIdleSoundId(e.target.value)}
              className="cursor-pointer bg-transparent text-xs text-zinc-200 outline-none"
            >
              {IDLE_SOUNDS.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-900">
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => playSound(idleSoundId)}
            className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/30 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            title="Preview"
          >
            <Play size={11} />
            Preview
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

function ThemeSection(): React.ReactElement {
  const themeName = useThemeStore((s) => s.themeName)
  const variant = useThemeStore((s) => s.variant)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setVariant = useThemeStore((s) => s.setVariant)
  const accent = useAccent()
  const [editorOpen, setEditorOpen] = useState(false)

  const current = getThemeById(themeName)
  const supportsLight = current?.supportsLightMode ?? false

  const popular = getThemesByCategory('popular')
  const classic = getThemesByCategory('classic')
  const experimental = getThemesByCategory('experimental')

  return (
    <SectionCard title="Theme" description="Pick a theme and color variant.">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Variant</span>
          {!supportsLight && (
            <span className="text-[10px] text-zinc-600">Current theme is dark only</span>
          )}
        </div>
        <div className="inline-flex rounded border border-zinc-800 bg-zinc-900/80 p-0.5">
          <VariantButton
            label="Dark"
            icon={Moon}
            active={variant === 'dark'}
            accent={accent}
            onClick={() => setVariant('dark')}
          />
          <VariantButton
            label="Light"
            icon={Sun}
            active={variant === 'light'}
            accent={accent}
            disabled={!supportsLight}
            onClick={() => setVariant('light')}
          />
        </div>
      </div>

      <ThemeGroup
        title="Popular"
        themes={popular}
        current={themeName}
        accent={accent}
        onSelect={setTheme}
      />
      <ThemeGroup
        title="Classic"
        themes={classic}
        current={themeName}
        accent={accent}
        onSelect={setTheme}
      />
      <ThemeGroup
        title="Experimental"
        themes={experimental}
        current={themeName}
        accent={accent}
        onSelect={setTheme}
      />

      <div className="mt-4 border-t border-zinc-800 pt-4">
        <div className="mb-2 text-xs font-medium text-zinc-400">Custom</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme('custom')}
            className={cn(
              'flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition-colors',
              themeName === 'custom'
                ? 'border-transparent'
                : 'border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
            )}
            style={
              themeName === 'custom'
                ? { backgroundColor: `${accent}1a`, color: accent, borderColor: `${accent}66` }
                : undefined
            }
          >
            <Palette size={12} />
            Custom theme
          </button>
          <button
            onClick={() => {
              setTheme('custom')
              setEditorOpen(true)
            }}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/30 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <Pencil size={12} />
            Edit colors
          </button>
        </div>
      </div>

      {editorOpen && <CustomThemeEditor onClose={() => setEditorOpen(false)} />}
    </SectionCard>
  )
}

function VariantButton({
  label,
  icon: Icon,
  active,
  accent,
  disabled,
  onClick
}: {
  label: string
  icon: LucideIcon
  active: boolean
  accent: string
  disabled?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors',
        active ? '' : 'text-zinc-400 hover:text-zinc-200',
        disabled && 'cursor-not-allowed opacity-40 hover:text-zinc-400'
      )}
      style={active ? { backgroundColor: `${accent}26`, color: accent } : undefined}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

function ThemeGroup({
  title,
  themes,
  current,
  accent,
  onSelect
}: {
  title: string
  themes: ThemeDefinition[]
  current: string
  accent: string
  onSelect: (id: string) => void
}): React.ReactElement {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 text-xs font-medium text-zinc-400">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {themes.map((theme) => {
          const active = current === theme.id
          return (
            <button
              key={theme.id}
              onClick={() => onSelect(theme.id)}
              className={cn(
                'rounded border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-transparent'
                  : 'border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-100'
              )}
              style={
                active
                  ? { backgroundColor: `${accent}1a`, color: accent, borderColor: `${accent}66` }
                  : undefined
              }
            >
              {theme.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
