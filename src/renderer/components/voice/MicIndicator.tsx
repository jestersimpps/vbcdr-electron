import { Mic, MicOff, Loader2, AudioLines, Brain } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useVoiceStore, type MicStatus } from '@/services/voice/voice-controller'
import { cn } from '@/lib/utils'
import { isFeatureEnabled } from '@/config/feature-flags'

const LABEL: Record<MicStatus, string> = {
  off: 'Voice off',
  starting: 'Starting the microphone…',
  listening: 'Listening',
  hearing: 'Hearing you',
  transcribing: 'Transcribing…',
  thinking: 'Translating…',
  error: 'Voice error'
}

export function MicIndicator(): React.ReactElement | null {
  const micStatus = useVoiceStore((s) => s.micStatus)
  const micDetail = useVoiceStore((s) => s.micDetail)
  const showVoicePage = useProjectStore((s) => s.showVoicePage)

  if (!isFeatureEnabled('voiceControl')) return null
  if (micStatus === 'off') return null

  const icon =
    micStatus === 'starting' || micStatus === 'transcribing' ? (
      <Loader2 size={12} className="animate-spin" />
    ) : micStatus === 'thinking' ? (
      <Brain size={12} />
    ) : micStatus === 'hearing' ? (
      <AudioLines size={12} />
    ) : micStatus === 'error' ? (
      <MicOff size={12} />
    ) : (
      <Mic size={12} />
    )

  return (
    <button
      onClick={showVoicePage}
      title={micDetail ? `${LABEL[micStatus]} — ${micDetail}` : LABEL[micStatus]}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-meta transition-colors',
        micStatus === 'error'
          ? 'text-red-400 hover:bg-red-500/10'
          : micStatus === 'hearing'
            ? 'text-green-400 hover:bg-zinc-800'
            : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
      )}
    >
      {icon}
    </button>
  )
}
