import { describe, it, expect, beforeEach } from 'vitest'
import { Segmenter } from './segmenter'
import { useVoiceStore } from '@/services/voice/voice-controller'
import { matchFastPath } from './fast-path'

const SR = 16000
const FRAME = 128

function frames(ms: number): number {
  return Math.ceil(((ms / 1000) * SR) / FRAME)
}

/**
 * T30 stand-ins. A real soak needs an hour of ambient audio through a real mic and
 * cannot be simulated. What CAN be pinned down deterministically are the failure
 * modes a soak is meant to surface: unbounded growth, state that leaks between
 * utterances, and noise that trips the fast path.
 */
describe('T30 soak — unbounded growth', () => {
  beforeEach(() => {
    useVoiceStore.setState({ history: [], pending: null, awaiting: false })
  })

  it('caps history so a long session cannot grow without bound', () => {
    const push = useVoiceStore.getState().push
    for (let i = 0; i < 1000; i++) {
      push({ transcript: `utterance ${i}`, outcome: 'ok', ok: true, source: 'fast-path' })
    }
    const history = useVoiceStore.getState().history
    expect(history.length).toBeLessThanOrEqual(200)
    // The cap must keep the NEWEST entries, not the oldest.
    expect(history.at(-1)?.transcript).toBe('utterance 999')
  })

  it('does not retain audio buffers in history entries', () => {
    useVoiceStore.getState().push({
      transcript: 'hello',
      outcome: 'ok',
      ok: true,
      source: 'agent'
    })
    const entry = useVoiceStore.getState().history.at(-1)!
    for (const value of Object.values(entry)) {
      expect(value instanceof Float32Array).toBe(false)
      expect(ArrayBuffer.isView(value)).toBe(false)
    }
  })
})

describe('T30 soak — segmenter over a long session', () => {
  it('releases buffers after every utterance, so memory is flat across many', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 400, minSpeechMs: 100 })
    const durations: number[] = []

    for (let utterance = 0; utterance < 200; utterance++) {
      for (let i = 0; i < frames(500); i++) seg.push(new Float32Array(FRAME), true)
      let closed: ReturnType<Segmenter['push']> = null
      for (let i = 0; i < frames(500) && !closed; i++) {
        closed = seg.push(new Float32Array(FRAME), false)
      }
      expect(closed).not.toBeNull()
      durations.push(closed!.durationMs)
    }

    // Every utterance must be the same size: if state leaked between them the
    // buffers would grow monotonically.
    const first = durations[0]
    for (const d of durations) expect(Math.abs(d - first)).toBeLessThan(50)
    expect(seg.isSpeaking).toBe(false)
  })

  it('force-flushes rather than buffering forever when speech never stops', () => {
    const seg = new Segmenter({ sampleRate: SR, maxSegmentMs: 20000 })
    let closed: ReturnType<Segmenter['push']> = null
    for (let i = 0; i < frames(60000) && !closed; i++) {
      closed = seg.push(new Float32Array(FRAME), true)
    }
    expect(closed).not.toBeNull()
    expect(closed!.reason).toBe('max-length')
    expect(closed!.durationMs).toBeLessThanOrEqual(20100)
  })

  it('discards sub-threshold blips instead of accumulating them', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 300, minSpeechMs: 250 })
    for (let blip = 0; blip < 100; blip++) {
      for (let i = 0; i < frames(80); i++) seg.push(new Float32Array(FRAME), true)
      let closed: ReturnType<Segmenter['push']> = null
      for (let i = 0; i < frames(400) && !closed; i++) {
        closed = seg.push(new Float32Array(FRAME), false)
      }
      expect(closed).toBeNull()
    }
    expect(seg.isSpeaking).toBe(false)
  })
})

describe('T30 soak — spurious triggers from ambient speech', () => {
  it('does not fire an action on conversational noise', () => {
    const overheard = [
      'yeah I think so',
      'what time is the meeting',
      'can you pass me that',
      'no I already did',
      'hold on a second',
      'the weather is nice today',
      'did you see the game last night'
    ]
    for (const phrase of overheard) {
      expect(matchFastPath(phrase), phrase).toBeNull()
    }
  })

  it('still matches deliberate commands, so the guard is not just "reject everything"', () => {
    expect(matchFastPath('show git')).not.toBeNull()
    expect(matchFastPath('save the file')).not.toBeNull()
  })
})
