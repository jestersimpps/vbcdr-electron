import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { typescript } from 'monaco-editor'

type Disposable = { dispose(): void }

type LibHandle = Disposable

interface LoadedProject {
  rootPath: string
  extraLibs: Map<string, LibHandle>
  fileMtimes: Map<string, number>
  tsconfigFound: boolean
}

const MAX_LOADED_PROJECTS = 3

const loaded = new Map<string, LoadedProject>()
const pendingScans = new Map<string, Promise<void>>()
let appliedCompilerOptionsJson = ''
let semanticValidationEnabled = true

export const EXTRA_LIB_BATCH_SIZE = 50

const diagnosticCodesToIgnore = [
  2306, 2503, 2580, 2611, 2683, 2686, 2792,
  6133, 6196, 7016, 7026, 7031, 8006
]

export function applyDiagnosticsOptions(monaco: Monaco): void {
  const diagnosticsOptions = {
    noSemanticValidation: !semanticValidationEnabled,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
    diagnosticCodesToIgnore
  }
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
}

// Deliberately not exported: callers must go through recomputeSemanticValidation
// so the "every loaded project needs a tsconfig" rule below cannot be bypassed.
function setSemanticValidation(monaco: Monaco, enabled: boolean): void {
  if (semanticValidationEnabled === enabled) return
  semanticValidationEnabled = enabled
  applyDiagnosticsOptions(monaco)
}

/**
 * Monaco's typescript defaults are global — one worker program for the whole app —
 * but up to MAX_LOADED_PROJECTS projects contribute extra libs to it at once. So
 * semantic validation may only be enabled when EVERY loaded project has a tsconfig:
 * one tsconfig-less project (no `paths`, no `baseUrl`) makes almost every import in
 * its files unresolvable, and type-checking those is the storm we are avoiding.
 *
 * Recomputed on load only, never on unload, so the flag fails toward "off" — leaving
 * validation off a little longer costs nothing, while turning it back on with a large
 * tsconfig-less project still registered costs the main thread.
 */
function recomputeSemanticValidation(monaco: Monaco): void {
  let enabled = true
  for (const project of Array.from(loaded.values())) {
    if (!project.tsconfigFound) {
      enabled = false
      break
    }
  }
  setSemanticValidation(monaco, enabled)
}

function mapTarget(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const enums: Record<string, number> = {
    es3: 0, es5: 1, es2015: 2, es6: 2, es2016: 3, es2017: 4,
    es2018: 5, es2019: 6, es2020: 7, es2021: 8, es2022: 9,
    es2023: 10, es2024: 11, esnext: 99, latest: 99
  }
  return enums[value.toLowerCase()]
}

function mapModule(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const enums: Record<string, number> = {
    none: 0, commonjs: 1, amd: 2, umd: 3, system: 4,
    es6: 5, es2015: 5, es2020: 6, es2022: 7, esnext: 99,
    node16: 100, nodenext: 199, preserve: 200
  }
  return enums[value.toLowerCase()]
}

function mapModuleResolution(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const enums: Record<string, number> = {
    classic: 1, node: 2, node10: 2, node16: 3, nodenext: 99, bundler: 100
  }
  return enums[value.toLowerCase()]
}

function mapJsx(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const enums: Record<string, number> = {
    none: 0, preserve: 1, react: 2, 'react-native': 3, 'react-jsx': 4, 'react-jsxdev': 5
  }
  return enums[value.toLowerCase()]
}

function translateCompilerOptions(raw: Record<string, unknown>): typescript.CompilerOptions {
  const out: Record<string, unknown> = { ...raw }
  const t = mapTarget(raw.target); if (t !== undefined) out.target = t
  const m = mapModule(raw.module); if (m !== undefined) out.module = m
  const mr = mapModuleResolution(raw.moduleResolution); if (mr !== undefined) out.moduleResolution = mr
  const j = mapJsx(raw.jsx); if (j !== undefined) out.jsx = j
  out.allowNonTsExtensions = true
  out.allowJs = out.allowJs ?? true
  out.skipLibCheck = out.skipLibCheck ?? true
  out.esModuleInterop = out.esModuleInterop ?? true
  out.allowSyntheticDefaultImports = out.allowSyntheticDefaultImports ?? true
  out.resolveJsonModule = out.resolveJsonModule ?? true
  out.isolatedModules = out.isolatedModules ?? true
  return out as typescript.CompilerOptions
}

async function getMonaco(): Promise<Monaco> {
  return loader.init()
}

function disposeLib(handle: LibHandle): void {
  try { handle.dispose() } catch { /* already disposed */ }
}

interface ScanDelta {
  files: Record<string, string>
  hashes: Record<string, number>
  currentUris: string[]
}

async function applyScanDelta(monaco: Monaco, project: LoadedProject, delta: ScanDelta): Promise<void> {
  const ts = monaco.languages.typescript.typescriptDefaults
  const files = Object.entries(delta.files)
  for (let start = 0; start < files.length; start += EXTRA_LIB_BATCH_SIZE) {
    const batch = files.slice(start, start + EXTRA_LIB_BATCH_SIZE)
    for (const [uri, content] of batch) {
      const existing = project.extraLibs.get(uri)
      if (existing) disposeLib(existing)
      // allowJs makes TypeScript defaults sufficient for JS-family files too.
      const handle = ts.addExtraLib(content, uri)
      project.extraLibs.set(uri, handle)
      project.fileMtimes.set(uri, delta.hashes[uri] ?? simpleHash(content))
    }
    if (start + EXTRA_LIB_BATCH_SIZE < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (loaded.get(project.rootPath) !== project) return
    }
  }
  const current = new Set(delta.currentUris)
  for (const uri of Array.from(project.extraLibs.keys())) {
    if (current.has(uri)) continue
    const handle = project.extraLibs.get(uri)
    if (handle) disposeLib(handle)
    project.extraLibs.delete(uri)
    project.fileMtimes.delete(uri)
  }
}

function simpleHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}

export async function loadProjectIntoMonaco(rootPath: string): Promise<void> {
  const existing = pendingScans.get(rootPath)
  if (existing) return existing
  const scan = (async () => {
    try {
      const monaco = await getMonaco()
      const prior = loaded.get(rootPath)
      const knownHashes = prior && prior.fileMtimes.size > 0
        ? Object.fromEntries(prior.fileMtimes)
        : undefined
      const result = await window.api.tsproject.scan(rootPath, knownHashes)
      const project: LoadedProject = loaded.get(rootPath) ?? {
        rootPath,
        extraLibs: new Map(),
        fileMtimes: new Map(),
        tsconfigFound: result.tsconfigFound
      }
      project.tsconfigFound = result.tsconfigFound
      loaded.delete(rootPath)
      loaded.set(rootPath, project)
      for (const otherPath of Array.from(loaded.keys())) {
        if (loaded.size <= MAX_LOADED_PROJECTS) break
        if (otherPath !== rootPath) unloadProjectFromMonaco(otherPath)
      }
      const opts = translateCompilerOptions(result.compilerOptions)
      const optsJson = JSON.stringify(opts)
      if (optsJson !== appliedCompilerOptionsJson) {
        appliedCompilerOptionsJson = optsJson
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(opts)
        monaco.languages.typescript.javascriptDefaults.setCompilerOptions(opts)
      }
      recomputeSemanticValidation(monaco)
      await applyScanDelta(monaco, project, result)
    } catch (err) {
      console.error('[monaco-project-loader] scan failed:', err)
    } finally {
      pendingScans.delete(rootPath)
    }
  })()
  pendingScans.set(rootPath, scan)
  return scan
}

export async function updateFileInMonaco(rootPath: string, absolutePath: string, content: string): Promise<void> {
  const project = loaded.get(rootPath)
  if (!project) return
  const uri = `file://${absolutePath}`
  const monaco = await getMonaco()
  const ts = monaco.languages.typescript.typescriptDefaults
  const existing = project.extraLibs.get(uri)
  if (existing) disposeLib(existing)
  // allowJs makes TypeScript defaults sufficient for JS-family files too.
  const handle = ts.addExtraLib(content, uri)
  project.extraLibs.set(uri, handle)
  project.fileMtimes.set(uri, simpleHash(content))
}

export async function removeFileFromMonaco(rootPath: string, absolutePath: string): Promise<void> {
  const project = loaded.get(rootPath)
  if (!project) return
  const uri = `file://${absolutePath}`
  const existing = project.extraLibs.get(uri)
  if (!existing) return
  disposeLib(existing)
  project.extraLibs.delete(uri)
  project.fileMtimes.delete(uri)
}

export function unloadProjectFromMonaco(rootPath: string): void {
  const project = loaded.get(rootPath)
  if (!project) return
  for (const handle of project.extraLibs.values()) disposeLib(handle)
  project.extraLibs.clear()
  project.fileMtimes.clear()
  loaded.delete(rootPath)
}

export function __resetMonacoLoaderStateForTests(): void {
  for (const project of Array.from(loaded.values())) {
    for (const handle of Array.from(project.extraLibs.values())) disposeLib(handle)
  }
  loaded.clear()
  pendingScans.clear()
  appliedCompilerOptionsJson = ''
  semanticValidationEnabled = true
}
