import { useEffect, useState } from 'react'
import { Terminal } from 'lucide-react'
import { useLayoutStore } from '@/stores/layout-store'
import {
  SELECTABLE_LLM_PROVIDERS,
  capabilitiesFor,
  providerDefinition,
  type LlmProviderId
} from '@/config/llm-provider-registry'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'

export function LlmStartupCommandSection(): React.ReactElement {
  const llmProviderId = useLayoutStore((s) => s.llmProviderId)
  const llmCustomCommand = useLayoutStore((s) => s.llmCustomCommand)
  const setLlmProviderId = useLayoutStore((s) => s.setLlmProviderId)
  const setLlmCustomCommand = useLayoutStore((s) => s.setLlmCustomCommand)
  const accent = useAccent()
  const [draft, setDraft] = useState<string>(llmCustomCommand)

  useEffect(() => {
    setDraft(llmCustomCommand)
  }, [llmCustomCommand])

  const capabilities = capabilitiesFor(llmProviderId)
  const command = providerDefinition(llmProviderId).command

  return (
    <SectionCard
      title="LLM assistant"
      description="Which coding assistant runs in new LLM terminal tabs."
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {SELECTABLE_LLM_PROVIDERS.map((provider) => {
          const active = provider.id === llmProviderId
          return (
            <button
              key={provider.id}
              onClick={() => setLlmProviderId(provider.id as LlmProviderId)}
              className="rounded border px-2.5 py-1.5 text-xs transition-colors"
              style={{
                borderColor: active ? accent : '#27272a',
                backgroundColor: active ? `${accent}1a` : 'transparent',
                color: active ? accent : '#a1a1aa'
              }}
            >
              {provider.label}
            </button>
          )
        })}
      </div>

      {llmProviderId === 'custom' ? (
        <div className="mt-2.5 flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
          <Terminal size={13} style={{ color: accent }} />
          <input
            type="text"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => setLlmCustomCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setLlmCustomCommand((e.target as HTMLInputElement).value)
            }}
            placeholder="claude --resume"
            className="w-64 bg-transparent font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
      ) : (
        <p className="mt-2.5 font-mono text-xs text-zinc-500">Runs: {command}</p>
      )}

      {!capabilities.sessions && (
        <p className="mt-2.5 text-xs text-zinc-500">
          Session history, context usage, MCP, skills and permissions read Claude Code&apos;s files
          and stay hidden for this assistant.
        </p>
      )}
    </SectionCard>
  )
}
