import { BrowserWindow } from 'electron'
import { safeHandle } from './safe-handle'
import {
  sendToVoiceAgent,
  startVoiceAgent,
  stopVoiceAgent,
  voiceAgentStatus
} from '../services/voice-agent'

export function registerVoiceAgentHandlers(): void {
  safeHandle(
    'voice-agent:start',
    (
      event,
      cwd: string,
      command: string,
      preamble: string,
      readyPatternSource?: string
    ): boolean => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return false
      startVoiceAgent(win, cwd, command, preamble, readyPatternSource)
      return true
    }
  )

  safeHandle('voice-agent:send', (_event, text: string): boolean => sendToVoiceAgent(text))

  safeHandle('voice-agent:stop', (): boolean => {
    stopVoiceAgent()
    return true
  })

  safeHandle('voice-agent:status', (): string => voiceAgentStatus())
}
