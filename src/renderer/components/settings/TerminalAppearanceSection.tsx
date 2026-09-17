import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import {
  useTerminalPrefsStore,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_PRESETS
} from '@/stores/terminal-prefs-store'
import { TERMINAL_THEME_OPTIONS, getTerminalTheme } from '@/config/terminal-theme-registry'
import { CustomThemeEditor } from '@/components/theme/CustomThemeEditor'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'

const CUSTOM_FONT_OPTION = '__custom__'
const SELECT_CLASS =
  'cursor-pointer rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200 outline-none'

export function TerminalAppearanceSection(): React.ReactElement {
  const terminalThemeId = useThemeStore((s) => s.terminalThemeId)
  const setTerminalTheme = useThemeStore((s) => s.setTerminalTheme)
  const variant = useThemeStore((s) => s.variant)
  const effectiveThemeId = useThemeStore((s) => s.getTerminalThemeId())
  // The registry mutates custom themes in place; subscribing keeps the preview in sync while editing.
  useThemeStore((s) => s.customDark)
  useThemeStore((s) => s.customLight)
  const fontFamily = useTerminalPrefsStore((s) => s.fontFamily)
  const setFontFamily = useTerminalPrefsStore((s) => s.setFontFamily)
  const fontSize = useTerminalPrefsStore((s) => s.fontSize)
  const setFontSize = useTerminalPrefsStore((s) => s.setFontSize)
  const accent = useAccent()

  const isPreset = TERMINAL_FONT_PRESETS.some((p) => p.value === fontFamily)
  const [customFontMode, setCustomFontMode] = useState(!isPreset)
  const [customFontDraft, setCustomFontDraft] = useState(fontFamily)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    setCustomFontDraft(fontFamily)
  }, [fontFamily])

  const theme = getTerminalTheme(effectiveThemeId)

  const handleFontSelect = (value: string): void => {
    if (value === CUSTOM_FONT_OPTION) {
      setCustomFontMode(true)
      return
    }
    setCustomFontMode(false)
    setFontFamily(value)
  }

  return (
    <SectionCard title="Terminal appearance" description="Colors and font for all terminals. Changes apply immediately.">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-200">Color theme</div>
            <div className="text-meta text-zinc-500">Auto follows the app theme.</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Terminal color theme"
              value={terminalThemeId}
              onChange={(e) => setTerminalTheme(e.target.value)}
              className={SELECT_CLASS}
            >
              {TERMINAL_THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-zinc-900">{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                setTerminalTheme(`custom-${variant}`)
                setEditorOpen(true)
              }}
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/30 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            >
              <Pencil size={12} />
              Custom colors
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-200">Font family</div>
            <div className="text-meta text-zinc-500">Must be a monospace font installed on this machine.</div>
          </div>
          <select
            aria-label="Terminal font family"
            value={customFontMode ? CUSTOM_FONT_OPTION : fontFamily}
            onChange={(e) => handleFontSelect(e.target.value)}
            className={SELECT_CLASS}
          >
            {TERMINAL_FONT_PRESETS.map((p) => (
              <option key={p.value} value={p.value} className="bg-zinc-900">{p.label}</option>
            ))}
            <option value={CUSTOM_FONT_OPTION} className="bg-zinc-900">Custom…</option>
          </select>
        </div>
        {customFontMode && (
          <input
            aria-label="Custom terminal font family"
            type="text"
            value={customFontDraft}
            placeholder="e.g. Hack Nerd Font, monospace"
            onChange={(e) => setCustomFontDraft(e.target.value)}
            onBlur={() => setFontFamily(customFontDraft)}
            onKeyDown={(e) => { if (e.key === 'Enter') setFontFamily(customFontDraft) }}
            className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 font-mono text-xs text-zinc-200 outline-none"
          />
        )}

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
            <span>Font size</span>
            <span className="tabular-nums text-zinc-400">{fontSize}px</span>
          </div>
          <input
            aria-label="Terminal font size in pixels"
            type="range"
            min={MIN_TERMINAL_FONT_SIZE}
            max={MAX_TERMINAL_FONT_SIZE}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ accentColor: accent }}
            className="h-1 w-full cursor-pointer"
          />
        </div>

        <div
          aria-label="Terminal preview"
          className="overflow-hidden rounded border border-zinc-800 px-3 py-2"
          style={{ backgroundColor: theme.background, color: theme.foreground, fontFamily, fontSize }}
        >
          <div>
            <span style={{ color: theme.green }}>~/project</span>{' '}
            <span style={{ color: theme.blue }}>main</span> $ npm test
          </div>
          <div>
            <span style={{ color: theme.red }}>✗ 1 failed</span>{' '}
            <span style={{ color: theme.yellow }}>2 skipped</span>{' '}
            <span style={{ color: theme.cyan }}>40 passed</span>{' '}
            <span style={{ color: theme.magenta }}>0O 1lI</span>
          </div>
        </div>
      </div>

      {editorOpen && <CustomThemeEditor terminalOnly onClose={() => setEditorOpen(false)} />}
    </SectionCard>
  )
}
