export interface CompanionVoice {
  id: string
  label: string
  note: string
}

export const DEFAULT_COMPANION_VOICE = 'en-US-AvaNeural'

export const COMPANION_VOICES: CompanionVoice[] = [
  { id: 'en-US-AvaNeural', label: 'Ava', note: 'Conversational, dry' },
  { id: 'en-US-EmmaNeural', label: 'Emma', note: 'Cheerful, clear' },
  { id: 'en-US-AriaNeural', label: 'Aria', note: 'Confident' },
  { id: 'en-US-JennyNeural', label: 'Jenny', note: 'Friendly' },
  { id: 'en-US-MichelleNeural', label: 'Michelle', note: 'Pleasant' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', note: 'British' },
  { id: 'en-GB-LibbyNeural', label: 'Libby', note: 'British, warm' },
  { id: 'en-US-AnaNeural', label: 'Ana', note: 'Cute, cartoon' }
]
