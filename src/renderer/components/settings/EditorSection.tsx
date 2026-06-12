import { useEditorPrefsStore } from '@/stores/editor-prefs-store'
import { PrefToggle, SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

export function EditorSection(): React.ReactElement {
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
            <div className="text-meta text-zinc-500">
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
