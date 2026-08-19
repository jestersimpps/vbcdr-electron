const MAX_QUEUED = 3

export interface TranscriptionResult {
  text: string
  ms: number
  device: string
}

interface Pending {
  resolve: (value: TranscriptionResult) => void
  reject: (reason: Error) => void
}

export class Transcriber {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private queue: number[] = []
  private nextId = 1
  private ready = false

  async start(): Promise<void> {
    if (this.worker) return

    this.worker = new Worker(new URL('./transcribe.worker.ts', import.meta.url), {
      type: 'module'
    })

    this.worker.onmessage = (event: MessageEvent): void => {
      const data = event.data as {
        type: string
        id?: number
        text?: string
        ms?: number
        device?: string
        message?: string
      }

      if (data.type === 'ready') {
        this.ready = true
        return
      }

      if (data.type === 'result' && data.id !== undefined) {
        this.dequeue(data.id)
        this.pending.get(data.id)?.resolve({
          text: data.text ?? '',
          ms: data.ms ?? 0,
          device: data.device ?? 'unknown'
        })
        this.pending.delete(data.id)
        return
      }

      if (data.type === 'error') {
        const err = new Error(data.message ?? 'Transcription failed')
        if (data.id !== undefined) {
          this.dequeue(data.id)
          this.pending.get(data.id)?.reject(err)
          this.pending.delete(data.id)
        } else {
          for (const [id, p] of Array.from(this.pending)) {
            p.reject(err)
            this.pending.delete(id)
          }
          this.queue = []
        }
      }
    }

    this.worker.postMessage({ type: 'init' })
  }

  private dequeue(id: number): void {
    const idx = this.queue.indexOf(id)
    if (idx !== -1) this.queue.splice(idx, 1)
  }

  get isReady(): boolean {
    return this.ready
  }

  get queueDepth(): number {
    return this.queue.length
  }

  transcribe(pcm: Float32Array): Promise<TranscriptionResult> {
    if (!this.worker) return Promise.reject(new Error('Transcriber is not started'))

    // Backpressure: drop the OLDEST queued segment, mirroring PENDING_BYTES_CAP
    // in pty-manager. Newer speech is more relevant than a stale backlog.
    while (this.queue.length >= MAX_QUEUED) {
      const oldest = this.queue.shift()
      if (oldest === undefined) break
      this.pending.get(oldest)?.reject(new Error('Dropped: transcription backlog'))
      this.pending.delete(oldest)
    }

    const id = this.nextId++
    this.queue.push(id)

    return new Promise<TranscriptionResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const copy = new Float32Array(pcm)
      this.worker!.postMessage({ type: 'transcribe', id, pcm: copy }, [copy.buffer])
    })
  }

  stop(): void {
    for (const p of Array.from(this.pending.values())) p.reject(new Error('Transcriber stopped'))
    this.pending.clear()
    this.queue = []
    this.ready = false
    this.worker?.terminate()
    this.worker = null
  }
}
