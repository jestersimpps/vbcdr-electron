import { Play, Volume2 } from 'lucide-react'
import { useLayoutStore } from '@/stores/layout-store'
import { IDLE_SOUNDS } from '@/config/sound-registry'
import { SectionCard, Toggle, useAccent } from '@/components/settings/SettingsControls'
import { playSound } from '@/lib/sound'

export function SoundSection(): React.ReactElement {
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
