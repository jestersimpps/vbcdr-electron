import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ORT_DIST = resolve(
  'node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist'
)
const LOADER = 'ort-wasm-simd-threaded.mjs'
const BINARY = 'ort-wasm-simd-threaded.wasm'

// Two consumers, two different ORT builds, one shared directory:
//   vad-web (Silero, wasm EP)      → the plain pair
//   transformers.js (whisper, GPU) → asyncify + jsep
const REQUIRED = [
  LOADER,
  BINARY,
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm'
]

/**
 * Regression guard for a live 404 hit in `npm run dev`:
 *
 *   GET /@fs/.../node_modules/.vite/deps/ort-wasm-simd-threaded.mjs 404
 *
 * vad-web fetches its ONNX loader from `onnxWASMBasePath`, and that loader then
 * fetches its sibling .wasm by an EXACT hardcoded name. Vite hashes asset
 * filenames, which breaks the second fetch, so `ortAssetsPlugin` copies both files
 * verbatim to assets/ort/ and serves that path in dev.
 */
describe('ONNX runtime asset contract', () => {
  it('ships every ORT build both consumers need at runtime', () => {
    for (const f of REQUIRED) {
      expect(existsSync(resolve(ORT_DIST, f)), f).toBe(true)
    }
  })

  it('the build config copies all of them, not just the plain pair', () => {
    const config = readFileSync(resolve('electron.vite.config.ts'), 'utf8')
    for (const f of REQUIRED) {
      expect(config, f).toContain(f)
    }
  })

  it('the transcription worker anchors wasmPaths on the origin, not its own URL', () => {
    // The worker lives at /services/ in dev but /assets/ in a build, so a path
    // relative to import.meta.url resolves differently in each — the exact cause
    // of "Failed to fetch .../services/ort-wasm-simd-threaded.asyncify.mjs".
    const worker = readFileSync(
      resolve('src/renderer/services/voice/transcribe.worker.ts'),
      'utf8'
    )
    expect(worker).toContain('/assets/ort/')
    expect(worker).not.toMatch(/wasmPaths\s*=\s*new URL\('\.\/'/)
  })

  it('the loader requests its wasm by an exact unhashed sibling name', () => {
    // If this ever stops being true, the copy-verbatim plugin can be simplified.
    // While it IS true, hashed asset names cannot work.
    const loader = readFileSync(resolve(ORT_DIST, LOADER), 'utf8')
    expect(loader).toContain(BINARY)
  })

  it('the build config copies them verbatim rather than hashing them', () => {
    const config = readFileSync(resolve('electron.vite.config.ts'), 'utf8')
    expect(config).toContain('ortAssetsPlugin')
    expect(config).toContain('assets/ort')
    expect(config).toContain(LOADER)
    expect(config).toContain(BINARY)
  })

  it('vad.ts points onnxWASMBasePath at that copied directory', () => {
    const vad = readFileSync(resolve('src/renderer/services/voice/vad.ts'), 'utf8')
    expect(vad).toContain("assets/ort/")
    expect(vad).toContain('onnxWASMBasePath')
    // A bare deep import would resolve at build time but 404 at runtime.
    expect(vad).not.toContain("from 'onnxruntime-web/dist/")
  })
})
