import { useEffect, useState } from 'react'
import { RotateCcw, Terminal } from 'lucide-react'
import { useLayoutStore, DEFAULT_LLM_STARTUP_COMMAND } from '@/stores/layout-store'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'

export function LlmStartupCommandSection(): React.ReactElement {
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
