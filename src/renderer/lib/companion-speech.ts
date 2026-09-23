let current: HTMLAudioElement | null = null
let currentUrl: string | null = null
let context: AudioContext | null = null
let analyser: AnalyserNode | null = null
let samples: Uint8Array<ArrayBuffer> | null = null
let levelFrame: number | null = null

type LevelListener = (level: number) => void
const levelListeners = new Set<LevelListener>()

/** Drives the mouth while she talks. Level is 0..1, and 0 means closed. */
export function onSpeechLevel(listener: LevelListener): () => void {
  levelListeners.add(listener)
  return (): void => {
    levelListeners.delete(listener)
  }
}

function emitLevel(level: number): void {
  for (const listener of levelListeners) listener(level)
}

function stopLevelLoop(): void {
  if (levelFrame !== null) cancelAnimationFrame(levelFrame)
  levelFrame = null
  emitLevel(0)
}

/**
 * RMS of the waveform, normalised into something the mouth can use. Speech
 * rarely fills the range, so the level is scaled up and clamped rather than
 * used raw, otherwise the mouth barely parts.
 */
function readLevel(): number {
  if (!analyser || !samples) return 0
  analyser.getByteTimeDomainData(samples)
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128
    sum += v * v
  }
  // Speech RMS sits around 0.05-0.2, so it takes a lot of gain before the
  // viseme blendshapes (which bind at full weight) read as an open mouth.
  return Math.min(1, Math.sqrt(sum / samples.length) * 7)
}

function startLevelLoop(): void {
  const tick = (): void => {
    emitLevel(readLevel())
    levelFrame = requestAnimationFrame(tick)
  }
  stopLevelLoop()
  levelFrame = requestAnimationFrame(tick)
}

function release(): void {
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = null
  current = null
  stopLevelLoop()
}

export function stopSpeech(): void {
  if (current) {
    current.pause()
    current.src = ''
  }
  release()
}

/**
 * Routes the element through an analyser so the mouth can follow the waveform.
 * The graph still terminates at the destination, so audio is unaffected.
 */
function attachAnalyser(audio: HTMLAudioElement): void {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    if (!analyser) {
      analyser = context.createAnalyser()
      analyser.fftSize = 512
      // Near zero: any averaging here flattens the syllable peaks that make
      // the mouth look like it is actually forming words.
      analyser.smoothingTimeConstant = 0.05
      samples = new Uint8Array(new ArrayBuffer(analyser.fftSize))
      analyser.connect(context.destination)
    }
    // A media element can only ever be adopted by one source node, which is why
    // every utterance builds a fresh Audio rather than reusing one.
    context.createMediaElementSource(audio).connect(analyser)
  } catch (e) {
    console.warn('[companion-tts] analyser unavailable:', e)
    analyser = null
  }
}

/** Stopping pauses the element, so a line cut short settles the same as one that ran out. */
function untilSilent(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    audio.addEventListener('ended', () => resolve(), { once: true })
    audio.addEventListener('pause', () => resolve(), { once: true })
  })
}

/** Resolves once the line has finished playing, so callers can keep lines from talking over each other. */
export async function speak(text: string, voice: string, volume = 0.7): Promise<void> {
  try {
    const bytes = await window.api.companion.speak(text, voice)
    if (!bytes || bytes.length === 0) return

    stopSpeech()

    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    const blob = new Blob([buffer], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, volume))
    current = audio
    currentUrl = url

    attachAnalyser(audio)
    audio.addEventListener('ended', release, { once: true })
    const finished = untilSilent(audio)
    await audio.play()
    if (analyser) startLevelLoop()
    await finished
  } catch (e) {
    console.warn('[companion-tts] speak failed:', e)
    stopSpeech()
  }
}
