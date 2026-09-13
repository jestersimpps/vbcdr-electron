let current: HTMLAudioElement | null = null
let currentUrl: string | null = null

function release(): void {
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = null
  current = null
}

export function stopSpeech(): void {
  if (current) {
    current.pause()
    current.src = ''
  }
  release()
}

export async function speak(text: string, voice: string, volume = 0.7): Promise<void> {
  try {
    const bytes = await window.api.companion.speak(text, voice)
    if (!bytes || bytes.length === 0) return

    stopSpeech()

    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, volume))
    current = audio
    currentUrl = url

    audio.addEventListener('ended', release, { once: true })
    await audio.play()
  } catch (e) {
    console.warn('[companion-tts] speak failed:', e)
    stopSpeech()
  }
}
