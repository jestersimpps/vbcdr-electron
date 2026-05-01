import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/config/sound-registry', () => ({
  getSoundById: vi.fn((id: string) => ({ url: `mock://${id}.mp3` }))
}))

interface MockAudio {
  src: string
  preload: string
  volume: number
  currentTime: number
  paused: boolean
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
}

let lastAudio: MockAudio | null = null
const audioInstances: MockAudio[] = []

class FakeAudio {
  src = ''
  preload = ''
  volume = 1
  currentTime = 0
  paused = true
  pause = vi.fn(() => {
    this.paused = true
  })
  play = vi.fn(async () => undefined)
  constructor(url: string) {
    this.src = url
    lastAudio = this as unknown as MockAudio
    audioInstances.push(this as unknown as MockAudio)
  }
}

describe('lib/sound', () => {
  beforeEach(() => {
    vi.resetModules()
    audioInstances.length = 0
    lastAudio = null
    ;(globalThis as { Audio: typeof FakeAudio }).Audio = FakeAudio
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('plays a sound at the requested volume and resets currentTime', async () => {
    const { playSound } = await import('./sound')
    playSound('chirp', 0.4)
    expect(lastAudio).not.toBeNull()
    expect(lastAudio!.src).toBe('mock://chirp.mp3')
    expect(lastAudio!.preload).toBe('auto')
    expect(lastAudio!.pause).toHaveBeenCalledTimes(1)
    expect(lastAudio!.currentTime).toBe(0)
    expect(lastAudio!.volume).toBe(0.4)
    expect(lastAudio!.play).toHaveBeenCalledTimes(1)
  })

  it('clamps volume to the [0, 1] range', async () => {
    const { playSound } = await import('./sound')
    playSound('a', 5)
    expect(lastAudio!.volume).toBe(1)
    playSound('a', -1)
    expect(lastAudio!.volume).toBe(0)
  })

  it('caches Audio instances per soundId', async () => {
    const { playSound } = await import('./sound')
    playSound('cached')
    playSound('cached')
    expect(audioInstances).toHaveLength(1)
    playSound('different')
    expect(audioInstances).toHaveLength(2)
  })

  it('falls back to default volume of 0.6 when omitted', async () => {
    const { playSound } = await import('./sound')
    playSound('default-vol')
    expect(lastAudio!.volume).toBeCloseTo(0.6)
  })

  it('logs a warning when Audio construction throws and does not rethrow', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    ;(globalThis as { Audio: unknown }).Audio = class {
      constructor() {
        throw new Error('boom')
      }
    }
    const { playSound } = await import('./sound')
    expect(() => playSound('bad')).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[idle-sound]'), expect.any(Error))
  })

  it('logs a warning when audio.play() rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    class RejectingAudio extends FakeAudio {
      constructor(url: string) {
        super(url)
        this.play = vi.fn(() => Promise.reject(new Error('blocked')))
      }
    }
    ;(globalThis as { Audio: typeof RejectingAudio }).Audio = RejectingAudio
    const { playSound } = await import('./sound')
    playSound('reject')
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[idle-sound] play failed:'), expect.any(Error))
  })
})
