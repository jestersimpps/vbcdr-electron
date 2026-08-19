import workletUrl from './worklets/energy-gate.worklet.js?url'
import { Segmenter, type Segment } from '@/lib/voice/segmenter'

export interface CaptureCallbacks {
  onSegment: (segment: Segment) => void
  onLevel?: (rms: number) => void
  onError?: (message: string) => void
  onDeviceLost?: () => void
}

export interface CaptureOptions {
  deviceId?: string
  silenceMs?: number
  threshold?: number
}

const TARGET_SAMPLE_RATE = 16000

export class AudioCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private segmenter: Segmenter | null = null
  private callbacks: CaptureCallbacks | null = null
  private running = false

  get isRunning(): boolean {
    return this.running
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? TARGET_SAMPLE_RATE
  }

  async start(callbacks: CaptureCallbacks, options: CaptureOptions = {}): Promise<boolean> {
    if (this.running) return true
    this.callbacks = callbacks

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {})
        }
      })
    } catch (err) {
      callbacks.onError?.(
        err instanceof Error ? err.message : 'Microphone access was refused or unavailable'
      )
      return false
    }

    for (const track of this.stream.getAudioTracks()) {
      track.onended = () => {
        this.callbacks?.onDeviceLost?.()
        void this.stop()
      }
    }

    this.context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    this.segmenter = new Segmenter({
      sampleRate: this.context.sampleRate,
      ...(options.silenceMs ? { silenceMs: options.silenceMs } : {})
    })

    try {
      await this.context.audioWorklet.addModule(workletUrl)
    } catch (err) {
      callbacks.onError?.(
        `Could not load the audio worklet: ${err instanceof Error ? err.message : String(err)}`
      )
      await this.stop()
      return false
    }

    this.node = new AudioWorkletNode(this.context, 'energy-gate')
    if (options.threshold !== undefined) {
      this.node.port.postMessage({ threshold: options.threshold })
    }

    this.node.port.onmessage = (event: MessageEvent): void => {
      const data = event.data as {
        type: string
        pcm?: Float32Array
        rms?: number
        isSpeech?: boolean
      }
      if (data.type === 'level') {
        this.callbacks?.onLevel?.(data.rms ?? 0)
        return
      }
      if (data.type === 'audio' && data.pcm) {
        const segment = this.segmenter?.push(data.pcm, data.isSpeech === true)
        if (segment) this.callbacks?.onSegment(segment)
      }
    }

    this.source = this.context.createMediaStreamSource(this.stream)
    this.source.connect(this.node)
    this.running = true
    return true
  }

  async stop(): Promise<void> {
    this.running = false

    const pending = this.segmenter?.flush()
    if (pending) this.callbacks?.onSegment(pending)

    if (this.node) {
      this.node.port.onmessage = null
      this.node.disconnect()
      this.node = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
    if (this.context) {
      await this.context.close().catch(() => undefined)
      this.context = null
    }
    this.segmenter = null
  }
}
