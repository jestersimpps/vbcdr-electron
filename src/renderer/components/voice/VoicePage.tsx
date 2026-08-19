import { useEffect } from 'react'
import { VoiceSettings } from '@/components/voice/VoiceSettings'
import { VoiceHistory } from '@/components/voice/VoiceHistory'
import { AgentTerminal } from '@/components/voice/AgentTerminal'
import {
  attachVoiceAgentListeners,
  attachDeviceChangeRecovery
} from '@/services/voice/voice-controller'

export function VoicePage(): React.ReactElement {
  useEffect(() => {
    attachVoiceAgentListeners()
    return attachDeviceChangeRecovery()
  }, [])

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-zinc-950">
      <div className="w-80 shrink-0 overflow-y-auto border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-sm font-semibold text-zinc-200">Voice control</h1>
        <VoiceSettings />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <VoiceHistory />
        </div>
        <AgentTerminal />
      </div>
    </div>
  )
}
