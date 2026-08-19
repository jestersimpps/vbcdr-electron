import { describe, it, expect } from 'vitest'
import { Segmenter } from './segmenter'

const SR = 16000
const FRAME = 128
const frame = (): Float32Array => new Float32Array(FRAME)

function framesForMs(ms: number): number {
  return Math.ceil((ms / 1000) * SR / FRAME)
}

function feed(seg: Segmenter, ms: number, isSpeech: boolean): ReturnType<Segmenter['push']> {
  let out: ReturnType<Segmenter['push']> = null
  for (let i = 0; i < framesForMs(ms); i++) {
    const r = seg.push(frame(), isSpeech)
    if (r && !out) out = r
  }
  return out
}

describe('Segmenter', () => {
  it('ignores silence before any speech', () => {
    const seg = new Segmenter({ sampleRate: SR })
    expect(feed(seg, 3000, false)).toBeNull()
    expect(seg.isSpeaking).toBe(false)
  })

  it('closes a segment after the configured trailing silence', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 500 })
    expect(feed(seg, 800, true)).toBeNull()
    const out = feed(seg, 600, false)
    expect(out).not.toBeNull()
    expect(out?.reason).toBe('silence')
    expect(out!.durationMs).toBeGreaterThan(1200)
  })

  it('does not close early on a short mid-sentence pause', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 500 })
    feed(seg, 600, true)
    expect(feed(seg, 300, false)).toBeNull()
    feed(seg, 600, true)
    expect(seg.isSpeaking).toBe(true)
  })

  it('drops a segment shorter than minSpeechMs as noise', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 500, minSpeechMs: 250 })
    feed(seg, 100, true)
    expect(feed(seg, 600, false)).toBeNull()
  })

  it('force-flushes an over-long segment', () => {
    const seg = new Segmenter({ sampleRate: SR, maxSegmentMs: 2000 })
    const out = feed(seg, 2500, true)
    expect(out).not.toBeNull()
    expect(out?.reason).toBe('max-length')
  })

  it('concatenates frames in order into one buffer', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 300, minSpeechMs: 10 })
    const a = new Float32Array(FRAME).fill(0.5)
    const b = new Float32Array(FRAME).fill(-0.5)
    seg.push(a, true)
    seg.push(b, true)
    const out = feed(seg, 400, false)
    expect(out).not.toBeNull()
    expect(out!.pcm[0]).toBeCloseTo(0.5)
    expect(out!.pcm[FRAME]).toBeCloseTo(-0.5)
  })

  it('resets cleanly so the next utterance is independent', () => {
    const seg = new Segmenter({ sampleRate: SR, silenceMs: 400, minSpeechMs: 10 })
    feed(seg, 500, true)
    const first = feed(seg, 500, false)
    expect(first).not.toBeNull()
    expect(seg.isSpeaking).toBe(false)

    feed(seg, 500, true)
    const second = feed(seg, 500, false)
    expect(second).not.toBeNull()
    expect(second!.durationMs).toBeLessThan(first!.durationMs * 2)
  })

  it('flush() emits a pending utterance and nothing when idle', () => {
    const seg = new Segmenter({ sampleRate: SR, minSpeechMs: 10 })
    expect(seg.flush()).toBeNull()
    feed(seg, 400, true)
    expect(seg.flush()).not.toBeNull()
    expect(seg.flush()).toBeNull()
  })
})
