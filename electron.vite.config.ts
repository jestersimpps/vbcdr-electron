import { resolve } from 'path'
import { copyFileSync, mkdirSync, readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const ORT_DIST = resolve('node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist')
const VAD_DIST = resolve('node_modules/@ricky0123/vad-web/dist')
// Two consumers need different builds from the same directory:
//   vad-web (Silero, wasm EP)      → ort-wasm-simd-threaded.{mjs,wasm}
//   transformers.js (whisper, GPU) → ort-wasm-simd-threaded.asyncify.{mjs,wasm}
//                                    and .jsep.{mjs,wasm} when WebGPU is picked
const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm'
]
// MicVAD builds these two URLs itself as `baseAssetPath + <exact name>`, so they
// have to sit unhashed next to the ORT files rather than go through ?url imports.
const VAD_FILES = ['silero_vad_v5.onnx', 'vad.worklet.bundle.min.js']

/**
 * The ONNX runtime loader fetches its sibling `.wasm` by an EXACT hardcoded name,
 * relative to wherever the loader itself was served from. Vite's normal asset
 * pipeline hashes filenames, which breaks that contract (the loader asks for
 * `ort-wasm-simd-threaded.wasm` and gets a 404). Copy both files verbatim into
 * `assets/ort/` and serve that same path in dev, so one base path works in both.
 */
function ortAssetsPlugin(): PluginOption {
  return {
    name: 'vbcdr-ort-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url && /\/assets\/ort\/([a-zA-Z0-9._-]+)$/.exec(req.url.split('?')[0])
        const name = match?.[1]
        if (!name || !(ORT_FILES.includes(name) || VAD_FILES.includes(name))) return next()
        const body = readFileSync(resolve(VAD_FILES.includes(name) ? VAD_DIST : ORT_DIST, name))
        res.setHeader(
          'Content-Type',
          name.endsWith('.wasm')
            ? 'application/wasm'
            : name.endsWith('.onnx')
              ? 'application/octet-stream'
              : 'text/javascript'
        )
        res.end(body)
      })
    },
    generateBundle() {
      // emitted in writeBundle so the exact filenames survive hashing
    },
    writeBundle(options) {
      const outDir = options.dir ?? resolve('out/renderer')
      const target = resolve(outDir, 'assets/ort')
      mkdirSync(target, { recursive: true })
      for (const f of ORT_FILES) copyFileSync(resolve(ORT_DIST, f), resolve(target, f))
      for (const f of VAD_FILES) copyFileSync(resolve(VAD_DIST, f), resolve(target, f))
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: 'src/main/index.ts'
      }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: 'src/preload/index.ts'
      }
    }
  },
  renderer: {
    assetsInclude: ['**/*.vrm'],
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    plugins: [react(), tailwindcss(), ortAssetsPlugin()]
  }
})
