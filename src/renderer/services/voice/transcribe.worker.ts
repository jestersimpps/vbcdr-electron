import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

// The model weights are fetched from huggingface.co on FIRST use only, then held
// in the browser Cache API, which persists across app restarts. Every later run is
// fully offline. There is no bundled copy — ~50MB of weights would be paid by every
// user on every auto-update, including those who never enable voice.
env.allowLocalModels = false
env.useBrowserCache = true

// transformers.js points ONNX at https://cdn.jsdelivr.net/... unless wasmPaths is
// already set — that would break the offline guarantee and fail in a packaged build.
// It must point at the DIRECTORY holding the unhashed ort-wasm-* files, which
// `ortAssetsPlugin` copies verbatim to assets/ort/. Resolving against the worker's
// own URL is wrong — the worker sits at /services/ in dev but /assets/ in a build,
// so a relative hop lands somewhere different each time (observed as "Failed to
// fetch dynamically imported module .../services/...asyncify.mjs"). Anchor on the
// origin instead, which is identical in dev, production and file:// packaging.
env.backends.onnx.wasm!.wasmPaths = new URL('/assets/ort/', self.location.origin).href

const MODEL_ID = 'onnx-community/whisper-base.en'
const RECYCLE_AFTER = 60

let asr: AutomaticSpeechRecognitionPipeline | null = null
let device: 'webgpu' | 'wasm' = 'wasm'
let sinceLoad = 0

interface TranscribeRequest {
  type: 'transcribe'
  id: number
  pcm: Float32Array
}

interface InitRequest {
  type: 'init'
}

type WorkerRequest = TranscribeRequest | InitRequest

async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  if (!gpu) return 'wasm'
  try {
    return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

async function ensurePipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asr && sinceLoad < RECYCLE_AFTER) return asr

  if (asr) {
    await asr.dispose().catch(() => undefined)
    asr = null
  }

  device = await pickDevice()
  asr = (await pipeline('automatic-speech-recognition', MODEL_ID, {
    device,
    dtype: 'q4'
  })) as AutomaticSpeechRecognitionPipeline
  sinceLoad = 0
  return asr
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = event.data

  if (msg.type === 'init') {
    try {
      await ensurePipeline()
      self.postMessage({ type: 'ready', device })
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
    return
  }

  if (msg.type === 'transcribe') {
    const started = performance.now()
    try {
      const model = await ensurePipeline()
      const result = await model(msg.pcm)
      sinceLoad++
      const text = Array.isArray(result)
        ? result.map((r) => r.text).join(' ')
        : ((result as { text?: string }).text ?? '')
      self.postMessage({
        type: 'result',
        id: msg.id,
        text: text.trim(),
        ms: Math.round(performance.now() - started),
        device
      })
    } catch (err) {
      self.postMessage({
        type: 'error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}

export {}
