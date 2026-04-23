import { getSoundById } from '@/config/sound-registry'

const audioCache = new Map<string, HTMLAudioElement>()

function getAudio(soundId: string): HTMLAudioElement {
  const existing = audioCache.get(soundId)
  if (existing) return existing
  const { url } = getSoundById(soundId)
  const audio = new Audio(url)
  audio.preload = 'auto'
  audioCache.set(soundId, audio)
  return audio
}

export function playSound(soundId: string, volume = 0.6): void {
  try {
    const audio = getAudio(soundId)
    audio.pause()
    audio.currentTime = 0
    audio.volume = Math.max(0, Math.min(1, volume))
    void audio.play().catch(() => {})
  } catch {
    // ignore — audio can fail before user interaction
  }
}
