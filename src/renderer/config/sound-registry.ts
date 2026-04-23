import bubblePop from '@/assets/sounds/bubble-pop.mp3?url'
import messagePop from '@/assets/sounds/message-pop.mp3?url'
import confirmation from '@/assets/sounds/confirmation.mp3?url'
import interfaceHint from '@/assets/sounds/interface-hint.mp3?url'
import correctTone from '@/assets/sounds/correct-tone.mp3?url'
import interfaceBack from '@/assets/sounds/interface-back.mp3?url'

export interface SoundDefinition {
  id: string
  name: string
  url: string
}

export const IDLE_SOUNDS: SoundDefinition[] = [
  { id: 'bubble-pop', name: 'Bubble pop', url: bubblePop },
  { id: 'message-pop', name: 'Message pop', url: messagePop },
  { id: 'confirmation', name: 'Confirmation', url: confirmation },
  { id: 'interface-hint', name: 'Interface hint', url: interfaceHint },
  { id: 'correct-tone', name: 'Correct tone', url: correctTone },
  { id: 'interface-back', name: 'Interface back', url: interfaceBack }
]

export const DEFAULT_IDLE_SOUND_ID = 'bubble-pop'

export function getSoundById(id: string): SoundDefinition {
  return IDLE_SOUNDS.find((s) => s.id === id) ?? IDLE_SOUNDS[0]
}
