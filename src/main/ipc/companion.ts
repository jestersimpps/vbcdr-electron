import { safeHandle } from '@main/ipc/safe-handle'
import { ensureCompanionPrompt } from '@main/services/companion-prompt'
import { synthesize, DEFAULT_COMPANION_VOICE } from '@main/services/companion-tts'

export function registerCompanionHandlers(): void {
  safeHandle('companion:ensure-prompt', (): string => {
    return ensureCompanionPrompt()
  })

  safeHandle(
    'companion:speak',
    (_event, text: string, voice?: string): Promise<Uint8Array | null> => {
      return synthesize(text, voice || DEFAULT_COMPANION_VOICE)
    }
  )
}
