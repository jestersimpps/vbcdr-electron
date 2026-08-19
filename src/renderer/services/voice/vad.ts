import { MicVAD } from '@ricky0123/vad-web'
// vad-web fetches `<onnxWASMBasePath>ort-wasm-simd-threaded.mjs`, and that loader
// then fetches its sibling `.wasm` by an EXACT hardcoded name. MicVAD likewise
// builds `<baseAssetPath>silero_vad_v5.onnx` and `<baseAssetPath>vad.worklet.bundle.min.js`
// itself. Vite's hashed asset names break all of those, so `ortAssetsPlugin` in
// electron.vite.config.ts copies them verbatim to assets/ort/ (and serves the
// same path in dev), letting one base path work in both.
const ASSET_BASE_PATH = new URL('assets/ort/', document.baseURI).href

export interface VadCallbacks {
  onSpeechStart?: () => void
  onSpeechEnd: (pcm: Float32Array) => void
  onVadMisfire?: () => void
  onError?: (message: string) => void
}

export interface VadOptions {
  silenceMs?: number
  deviceId?: string
}

/**
 * Silero VAD wired to app-local assets.
 *
 * Both vad-web and onnxruntime-web default to CDN asset paths. Leaving those
 * defaults breaks the offline guarantee and fails outright in a packaged build,
 * where the base path resolves to a file:// URL — hence the explicit ?url imports.
 */
export class SileroVad {
  private vad: MicVAD | null = null
  private running = false

  get isRunning(): boolean {
    return this.running
  }

  async start(callbacks: VadCallbacks, options: VadOptions = {}): Promise<boolean> {
    if (this.vad) {
      this.vad.start()
      this.running = true
      return true
    }

    try {
      this.vad = await MicVAD.new({
        model: 'v5',
        // Both paths must be app-local: the defaults resolve to "/" (CDN-style),
        // which 404s in dev and breaks offline/packaged builds.
        baseAssetPath: ASSET_BASE_PATH,
        onnxWASMBasePath: ASSET_BASE_PATH,
        redemptionMs: options.silenceMs ?? 500,
        minSpeechMs: 250,
        preSpeechPadMs: 150,
        submitUserSpeechOnPause: true,
        // echoCancellation stops the app's own sound.ts blips being transcribed back.
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {})
            }
          }),
        onSpeechStart: () => callbacks.onSpeechStart?.(),
        onVADMisfire: () => callbacks.onVadMisfire?.(),
        onSpeechEnd: (audio: Float32Array) => callbacks.onSpeechEnd(audio)
      })
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err.message : String(err))
      this.vad = null
      return false
    }

    this.vad.start()
    this.running = true
    return true
  }

  setSilenceMs(ms: number): void {
    this.vad?.setOptions({ redemptionMs: ms })
  }

  pause(): void {
    this.vad?.pause()
    this.running = false
  }

  destroy(): void {
    try {
      this.vad?.destroy()
    } catch {
      /* already torn down */
    }
    this.vad = null
    this.running = false
  }
}
