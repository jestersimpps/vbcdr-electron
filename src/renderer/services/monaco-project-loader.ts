import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { languages } from 'monaco-editor'

type Disposable = { dispose(): void }

interface LibHandles {
  ts: Disposable
  js: Disposable
}

interface LoadedProject {
  rootPath: string
  extraLibs: Map<string, LibHandles>
  fileMtimes: Map<string, number>
}

const MAX_LOADED_PROJECTS = 3

const loaded = new Map<string, LoadedProject>()
const pendingScans = new Map<string, Promise<void>>()
let appliedCompilerOptionsJson = ''

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

function translateCompilerOptions(raw: Record<string, unknown>): languages.typescript.CompilerOptions {
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
  return out as languages.typescript.CompilerOptions
}

async function getMonaco(): Promise<Monaco> {
  return loader.init()
}

function disposeLibs(libs: LibHandles): void {
  try { libs.ts.dispose() } catch { /* already disposed */ }
  try { libs.js.dispose() } catch { /* already disposed */ }
}

interface ScanDelta {
  files: Record<string, string>
  hashes: Record<string, number>
  currentUris: string[]
}

function applyScanDelta(monaco: Monaco, project: LoadedProject, delta: ScanDelta): void {
  const ts = monaco.languages.typescript.typescriptDefaults
  const js = monaco.languages.typescript.javascriptDefaults
  for (const [uri, content] of Object.entries(delta.files)) {
    const existing = project.extraLibs.get(uri)
    if (existing) disposeLibs(existing)
    const handles: LibHandles = {
      ts: ts.addExtraLib(content, uri),
      js: js.addExtraLib(content, uri)
    }
    project.extraLibs.set(uri, handles)
    project.fileMtimes.set(uri, delta.hashes[uri] ?? simpleHash(content))
  }
  const current = new Set(delta.currentUris)
  for (const uri of Array.from(project.extraLibs.keys())) {
    if (current.has(uri)) continue
    const handles = project.extraLibs.get(uri)
    if (handles) disposeLibs(handles)
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
        fileMtimes: new Map()
      }
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
      applyScanDelta(monaco, project, result)
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
  const js = monaco.languages.typescript.javascriptDefaults
  const existing = project.extraLibs.get(uri)
  if (existing) disposeLibs(existing)
  const handles: LibHandles = {
    ts: ts.addExtraLib(content, uri),
    js: js.addExtraLib(content, uri)
  }
  project.extraLibs.set(uri, handles)
  project.fileMtimes.set(uri, simpleHash(content))
}

export async function removeFileFromMonaco(rootPath: string, absolutePath: string): Promise<void> {
  const project = loaded.get(rootPath)
  if (!project) return
  const uri = `file://${absolutePath}`
  const existing = project.extraLibs.get(uri)
  if (!existing) return
  disposeLibs(existing)
  project.extraLibs.delete(uri)
  project.fileMtimes.delete(uri)
}

export function unloadProjectFromMonaco(rootPath: string): void {
  const project = loaded.get(rootPath)
  if (!project) return
  for (const handles of project.extraLibs.values()) disposeLibs(handles)
  project.extraLibs.clear()
  project.fileMtimes.clear()
  loaded.delete(rootPath)
}
