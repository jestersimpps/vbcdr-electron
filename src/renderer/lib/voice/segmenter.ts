export interface SegmenterOptions {
  sampleRate: number
  silenceMs: number
  minSpeechMs: number
  maxSegmentMs: number
}

export interface Segment {
  pcm: Float32Array
  durationMs: number
  reason: 'silence' | 'max-length'
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  sampleRate: 16000,
  silenceMs: 500,
  minSpeechMs: 250,
  maxSegmentMs: 20000
}

export class Segmenter {
  private readonly opts: SegmenterOptions
  private chunks: Float32Array[] = []
  private samples = 0
  private silenceSamples = 0
  private speaking = false

  constructor(options: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER_OPTIONS, ...options }
  }

  private ms(samples: number): number {
    return (samples / this.opts.sampleRate) * 1000
  }

  push(frame: Float32Array, isSpeech: boolean): Segment | null {
    if (isSpeech) {
      this.speaking = true
      this.silenceSamples = 0
      this.chunks.push(frame)
      this.samples += frame.length
    } else if (this.speaking) {
      this.chunks.push(frame)
      this.samples += frame.length
      this.silenceSamples += frame.length
    } else {
      return null
    }

    if (this.ms(this.samples) >= this.opts.maxSegmentMs) return this.close('max-length')
    if (this.speaking && this.ms(this.silenceSamples) >= this.opts.silenceMs) {
      return this.close('silence')
    }
    return null
  }

  private close(reason: Segment['reason']): Segment | null {
    const speechSamples = this.samples - this.silenceSamples
    const chunks = this.chunks
    const total = this.samples
    this.reset()

    if (this.ms(speechSamples) < this.opts.minSpeechMs) return null

    const pcm = new Float32Array(total)
    let offset = 0
    for (const c of chunks) {
      pcm.set(c, offset)
      offset += c.length
    }
    return { pcm, durationMs: this.ms(total), reason }
  }

  flush(): Segment | null {
    if (!this.speaking) return null
    return this.close('silence')
  }

  reset(): void {
    this.chunks = []
    this.samples = 0
    this.silenceSamples = 0
    this.speaking = false
  }

  get isSpeaking(): boolean {
    return this.speaking
  }
}
