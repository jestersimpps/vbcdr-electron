import { useLayoutStore } from '@/stores/layout-store'
import { SectionCard, PrefToggle, useAccent } from '@/components/settings/SettingsControls'
import { COMPANION_VOICES } from '@/config/companion-voices'
import { speak } from '@/lib/companion-speech'

export function CompanionSection(): React.ReactElement {
  const companionEnabled = useLayoutStore((s) => s.companionEnabled)
  const setCompanionEnabled = useLayoutStore((s) => s.setCompanionEnabled)
  const companionSpeechEnabled = useLayoutStore((s) => s.companionSpeechEnabled)
  const setCompanionSpeechEnabled = useLayoutStore((s) => s.setCompanionSpeechEnabled)
  const companionVoiceId = useLayoutStore((s) => s.companionVoiceId)
  const setCompanionVoiceId = useLayoutStore((s) => s.setCompanionVoiceId)
  const accent = useAccent()

  return (
    <SectionCard
      title="Companion"
      description="Show an animated character that reacts to what the agent is doing."
    >
      <PrefToggle
        label="Show companion"
        description="Renders a 3D character below the git panel. Pauses when the window loses focus."
        enabled={companionEnabled}
        onToggle={() => setCompanionEnabled(!companionEnabled)}
        accent={accent}
      />

      <PrefToggle
        label="Speak out loud"
        description="Reads the companion's line using Edge TTS. Requires the edge-tts binary."
        enabled={companionSpeechEnabled}
        onToggle={() => setCompanionSpeechEnabled(!companionSpeechEnabled)}
        accent={accent}
      />

      {companionSpeechEnabled && (
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <div className="text-body text-zinc-200">Voice</div>
            <div className="text-micro text-zinc-500">Microsoft Edge neural voices.</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              value={companionVoiceId}
              onChange={(e) => setCompanionVoiceId(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-meta text-zinc-200 outline-none focus:border-zinc-600"
            >
              {COMPANION_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.note}
                </option>
              ))}
            </select>
            <button
              onClick={() => void speak('here you go', companionVoiceId)}
              className="rounded border border-zinc-700 px-2 py-1 text-meta text-zinc-300 hover:bg-zinc-800"
            >
              Test
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
