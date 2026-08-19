import { useEffect, useState } from 'react'
import { Terminal, Play, Square, RotateCw, Mic, MicOff } from 'lucide-react'
import { useLayoutStore } from '@/stores/layout-store'
import {
  VOICE_AGENT_PROVIDERS,
  providerDefinition,
  type LlmProviderId
} from '@/config/llm-provider-registry'
import { SectionCard, PrefToggle, useAccent } from '@/components/settings/SettingsControls'
import {
  useVoiceStore,
  startVoiceAgent,
  stopVoiceAgent,
  startListening,
  stopListening,
  isModelCached,
  type MicStatus
} from '@/services/voice/voice-controller'

const STATUS_LABEL: Record<string, string> = {
  stopped: 'Stopped',
  starting: 'Starting…',
  ready: 'Ready',
  degraded: 'Degraded'
}

const MIC_LABEL: Record<MicStatus, string> = {
  off: 'Muted',
  starting: 'Starting…',
  listening: 'Listening',
  hearing: 'Hearing you',
  transcribing: 'Transcribing…',
  thinking: 'Translating…',
  error: 'Error'
}

const STATUS_COLOR: Record<string, string> = {
  stopped: '#71717a',
  starting: '#eab308',
  ready: '#22c55e',
  degraded: '#ef4444'
}

export function VoiceSettings(): React.ReactElement {
  const accent = useAccent()
  const voiceAgentProviderId = useLayoutStore((s) => s.voiceAgentProviderId)
  const voiceAgentCustomCommand = useLayoutStore((s) => s.voiceAgentCustomCommand)
  const voiceVadSilenceMs = useLayoutStore((s) => s.voiceVadSilenceMs)
  const voiceConfirmDestructive = useLayoutStore((s) => s.voiceConfirmDestructive)
  const llmProviderId = useLayoutStore((s) => s.llmProviderId)
  const setVoiceAgentProviderId = useLayoutStore((s) => s.setVoiceAgentProviderId)
  const setVoiceAgentCustomCommand = useLayoutStore((s) => s.setVoiceAgentCustomCommand)
  const setVoiceVadSilenceMs = useLayoutStore((s) => s.setVoiceVadSilenceMs)
  const setVoiceConfirmDestructive = useLayoutStore((s) => s.setVoiceConfirmDestructive)

  const status = useVoiceStore((s) => s.status)
  const detail = useVoiceStore((s) => s.detail)
  const micStatus = useVoiceStore((s) => s.micStatus)
  const micDetail = useVoiceStore((s) => s.micDetail)
  const [modelPresent, setModelPresent] = useState<boolean | null>(null)

  useEffect(() => {
    void isModelCached().then(setModelPresent)
  }, [])

  const [draft, setDraft] = useState<string>(voiceAgentCustomCommand)
  useEffect(() => setDraft(voiceAgentCustomCommand), [voiceAgentCustomCommand])

  const effectiveId = voiceAgentProviderId ?? llmProviderId
  const resolvedCommand = useLayoutStore.getState().getVoiceAgentCommand()

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Translator"
        description="The CLI that turns what you say into an app action. Separate from your workspace assistant."
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setVoiceAgentProviderId(null)}
            className="rounded border px-2.5 py-1.5 text-xs transition-colors"
            style={{
              borderColor: voiceAgentProviderId === null ? accent : '#27272a',
              backgroundColor: voiceAgentProviderId === null ? `${accent}1a` : 'transparent',
              color: voiceAgentProviderId === null ? accent : '#a1a1aa'
            }}
          >
            Follow workspace ({providerDefinition(llmProviderId).label})
          </button>
          {VOICE_AGENT_PROVIDERS.map((provider) => {
            const active = provider.id === voiceAgentProviderId
            return (
              <button
                key={provider.id}
                onClick={() => setVoiceAgentProviderId(provider.id as LlmProviderId)}
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

        {effectiveId === 'custom' && (
          <div className="mt-2.5 flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
            <Terminal size={13} style={{ color: accent }} />
            <input
              type="text"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setVoiceAgentCustomCommand(draft)}
              placeholder="my-cli --interactive"
              className="w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
        )}

        <p className="mt-2 text-meta text-zinc-500">
          Runs: <span className="text-zinc-400">{resolvedCommand || '(nothing configured)'}</span>
        </p>
      </SectionCard>

      <SectionCard title="Agent session" description="Start the translator before sending utterances.">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: STATUS_COLOR[status] ?? '#71717a' }}
          />
          <span className="text-xs text-zinc-300">{STATUS_LABEL[status] ?? status}</span>
        </div>
        {detail && <p className="mt-1.5 text-meta text-zinc-500">{detail}</p>}

        <div className="mt-3 flex items-center gap-1.5">
          <button
            onClick={() => void startVoiceAgent()}
            disabled={status === 'starting' || status === 'ready'}
            className="flex items-center gap-1.5 rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
          >
            <Play size={12} /> Start
          </button>
          <button
            onClick={() => void stopVoiceAgent()}
            disabled={status === 'stopped'}
            className="flex items-center gap-1.5 rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
          >
            <Square size={12} /> Stop
          </button>
          <button
            onClick={() => void stopVoiceAgent().then(() => startVoiceAgent())}
            className="flex items-center gap-1.5 rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <RotateCw size={12} /> Restart
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Microphone"
        description="Speech is transcribed on-device. Nothing is uploaded."
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: micStatus === 'off' ? '#71717a' : micStatus === 'error' ? '#ef4444' : '#22c55e' }}
          />
          <span className="text-xs text-zinc-300">{MIC_LABEL[micStatus] ?? micStatus}</span>
        </div>
        {micDetail && <p className="mt-1.5 text-meta text-red-400">{micDetail}</p>}

        <div className="mt-3 flex items-center gap-1.5">
          <button
            onClick={() => void startListening()}
            disabled={micStatus !== 'off' && micStatus !== 'error'}
            className="flex items-center gap-1.5 rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
          >
            <Mic size={12} /> Listen
          </button>
          <button
            onClick={stopListening}
            disabled={micStatus === 'off'}
            className="flex items-center gap-1.5 rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
          >
            <MicOff size={12} /> Mute
          </button>
        </div>

        <p className="mt-2 text-meta text-zinc-500">
          Model: whisper-base.en{modelPresent === null ? '' : modelPresent ? ' (cached)' : ' (downloads on first use)'}
        </p>
      </SectionCard>

      <SectionCard title="Behaviour">
        <PrefToggle
          label="Confirm destructive actions"
          description="Ask before commit, restart, branch switch and close."
          enabled={voiceConfirmDestructive}
          onToggle={() => setVoiceConfirmDestructive(!voiceConfirmDestructive)}
          accent={accent}
        />
        <div className="mt-3">
          <label className="text-xs text-zinc-300">
            Trailing silence before a phrase ends
            <span className="ml-1.5 text-zinc-500">{voiceVadSilenceMs}ms</span>
          </label>
          <input
            type="range"
            min={300}
            max={2000}
            step={50}
            value={voiceVadSilenceMs}
            onChange={(e) => setVoiceVadSilenceMs(Number(e.target.value))}
            className="mt-1.5 w-full accent-current"
            style={{ color: accent }}
          />
        </div>
      </SectionCard>
    </div>
  )
}
