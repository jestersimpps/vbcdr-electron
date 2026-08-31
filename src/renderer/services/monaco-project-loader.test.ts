import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import {
  __resetMonacoLoaderStateForTests,
  applyDiagnosticsOptions,
  EXTRA_LIB_BATCH_SIZE,
  loadProjectIntoMonaco,
  unloadProjectFromMonaco,
  updateFileInMonaco
} from './monaco-project-loader'

vi.mock('@monaco-editor/react', () => ({
  loader: { init: vi.fn() }
}))

interface ScanResult {
  rootPath: string
  tsconfigFound: boolean
  compilerOptions: Record<string, unknown>
  files: Record<string, string>
  hashes: Record<string, number>
  currentUris: string[]
  truncated: boolean
}

interface FakeDefaults {
  addExtraLib: ReturnType<typeof vi.fn>
  setCompilerOptions: ReturnType<typeof vi.fn>
  setDiagnosticsOptions: ReturnType<typeof vi.fn>
}

let tsDefaults: FakeDefaults
let jsDefaults: FakeDefaults
let disposables: Map<string, Array<{ dispose: ReturnType<typeof vi.fn> }>>
let scan: ReturnType<typeof vi.fn>
let monaco: Monaco

function makeDefaults(): FakeDefaults {
  return {
    addExtraLib: vi.fn((_content: string, uri: string) => {
      const disposable = { dispose: vi.fn() }
      const existing = disposables.get(uri) ?? []
      existing.push(disposable)
      disposables.set(uri, existing)
      return disposable
    }),
    setCompilerOptions: vi.fn(),
    setDiagnosticsOptions: vi.fn()
  }
}

function resultFor(
  rootPath: string,
  files: Record<string, string>,
  tsconfigFound = true,
  currentUris = Object.keys(files)
): ScanResult {
  return {
    rootPath,
    tsconfigFound,
    compilerOptions: {},
    files,
    hashes: Object.fromEntries(Object.keys(files).map((uri, index) => [uri, index + 1])),
    currentUris,
    truncated: false
  }
}

/**
 * Drain microtasks until the first batch has registered, WITHOUT letting the
 * `setTimeout(0)` between batches fire — that gap is exactly what these tests
 * assert on. Counting `await Promise.resolve()` calls by hand would silently
 * break the moment an `await` is added upstream in loadProjectIntoMonaco, so
 * poll for the observable condition instead.
 */
async function reachFirstBatch(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (tsDefaults.addExtraLib.mock.calls.length > 0) return
    await Promise.resolve()
  }
  throw new Error('first batch never registered any extra lib')
}

beforeEach(() => {
  __resetMonacoLoaderStateForTests()
  vi.useFakeTimers()
  disposables = new Map()
  tsDefaults = makeDefaults()
  jsDefaults = makeDefaults()
  monaco = {
    languages: {
      typescript: {
        typescriptDefaults: tsDefaults,
        javascriptDefaults: jsDefaults
      }
    }
  } as unknown as Monaco
  vi.mocked(loader.init).mockResolvedValue(monaco)
  scan = vi.fn()
  ;(window.api as unknown as { tsproject: { scan: typeof scan } }).tsproject = { scan }
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('monaco-project-loader', () => {
  it('registers every scanned file once on TypeScript defaults only', async () => {
    const files = {
      'file:///project/a.ts': 'export const a = 1',
      'file:///project/b.js': 'export const b = 2'
    }
    scan.mockResolvedValue(resultFor('/project', files))

    await loadProjectIntoMonaco('/project')

    expect(tsDefaults.addExtraLib).toHaveBeenCalledTimes(2)
    expect(jsDefaults.addExtraLib).not.toHaveBeenCalled()
  })

  it('yields between batches and eventually registers all files', async () => {
    const total = EXTRA_LIB_BATCH_SIZE + 10
    const files = Object.fromEntries(
      Array.from({ length: total }, (_, index) => [`file:///project/${index}.ts`, `export const v${index} = ${index}`])
    )
    scan.mockResolvedValue(resultFor('/project', files))

    const loading = loadProjectIntoMonaco('/project')
    await reachFirstBatch()

    expect(tsDefaults.addExtraLib.mock.calls.length).toBeGreaterThan(0)
    expect(tsDefaults.addExtraLib.mock.calls.length).toBeLessThan(total)

    await vi.runAllTimersAsync()
    await loading
    expect(tsDefaults.addExtraLib).toHaveBeenCalledTimes(total)
  })

  it('disables semantic validation for a project with no tsconfig', async () => {
    scan.mockResolvedValueOnce(resultFor('/without-config', {}, false))
    await loadProjectIntoMonaco('/without-config')

    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ noSemanticValidation: true })
    )
  })

  it('leaves semantic validation on when the project has a tsconfig', async () => {
    scan.mockResolvedValueOnce(resultFor('/with-config', {}, true))
    await loadProjectIntoMonaco('/with-config')

    // Default is already on, so nothing needed changing.
    for (const call of tsDefaults.setDiagnosticsOptions.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ noSemanticValidation: false }))
    }
  })

  it('keeps semantic validation off while ANY loaded project lacks a tsconfig', async () => {
    scan.mockResolvedValueOnce(resultFor('/without-config', {}, false))
    await loadProjectIntoMonaco('/without-config')
    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ noSemanticValidation: true })
    )

    // Monaco's defaults are global, so opening a second, well-configured project
    // must NOT re-enable type-checking while the tsconfig-less one is still
    // registered — that would bring the main-thread storm straight back.
    scan.mockResolvedValueOnce(resultFor('/with-config', {}, true))
    await loadProjectIntoMonaco('/with-config')
    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ noSemanticValidation: true })
    )
  })

  it('re-enables semantic validation once the tsconfig-less project is unloaded', async () => {
    scan.mockResolvedValueOnce(resultFor('/without-config', {}, false))
    await loadProjectIntoMonaco('/without-config')

    unloadProjectFromMonaco('/without-config')

    scan.mockResolvedValueOnce(resultFor('/with-config', {}, true))
    await loadProjectIntoMonaco('/with-config')
    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ noSemanticValidation: false })
    )
  })

  it('applies diagnostics options to both defaults', () => {
    applyDiagnosticsOptions(monaco)

    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenCalledOnce()
    expect(jsDefaults.setDiagnosticsOptions).toHaveBeenCalledOnce()
    expect(jsDefaults.setDiagnosticsOptions).toHaveBeenCalledWith(
      tsDefaults.setDiagnosticsOptions.mock.calls[0][0]
    )
  })

  it('disposes an existing URI before re-registering it', async () => {
    const uri = 'file:///project/a.ts'
    scan.mockResolvedValueOnce(resultFor('/project', { [uri]: 'export const a = 1' }))
    await loadProjectIntoMonaco('/project')
    const firstHandle = disposables.get(uri)![0]

    scan.mockResolvedValueOnce(resultFor('/project', { [uri]: 'export const a = 2' }))
    await loadProjectIntoMonaco('/project')

    expect(firstHandle.dispose).toHaveBeenCalledOnce()
    expect(firstHandle.dispose.mock.invocationCallOrder[0])
      .toBeLessThan(tsDefaults.addExtraLib.mock.invocationCallOrder[1])
  })

  it('disposes and removes URIs absent from currentUris', async () => {
    const uri = 'file:///project/a.ts'
    scan.mockResolvedValueOnce(resultFor('/project', { [uri]: 'export const a = 1' }))
    await loadProjectIntoMonaco('/project')
    const firstHandle = disposables.get(uri)![0]

    scan.mockResolvedValueOnce(resultFor('/project', {}, true, []))
    await loadProjectIntoMonaco('/project')
    expect(firstHandle.dispose).toHaveBeenCalledOnce()

    scan.mockResolvedValueOnce(resultFor('/project', { [uri]: 'export const a = 2' }))
    await loadProjectIntoMonaco('/project')
    expect(firstHandle.dispose).toHaveBeenCalledOnce()
  })

  it('unloads and disposes every registered handle', async () => {
    const files = {
      'file:///project/a.ts': 'export const a = 1',
      'file:///project/b.ts': 'export const b = 2'
    }
    scan.mockResolvedValue(resultFor('/project', files))
    await loadProjectIntoMonaco('/project')

    unloadProjectFromMonaco('/project')

    for (const handles of Array.from(disposables.values())) {
      expect(handles[0].dispose).toHaveBeenCalledOnce()
    }
  })

  it('registers a single-file update on TypeScript defaults only', async () => {
    const uri = 'file:///project/a.ts'
    scan.mockResolvedValueOnce(resultFor('/project', { [uri]: 'export const a = 1' }))
    await loadProjectIntoMonaco('/project')
    const firstHandle = disposables.get(uri)![0]
    jsDefaults.addExtraLib.mockClear()

    await updateFileInMonaco('/project', '/project/a.ts', 'export const a = 2')

    expect(firstHandle.dispose).toHaveBeenCalledOnce()
    expect(disposables.get(uri)).toHaveLength(2)
    expect(jsDefaults.addExtraLib).not.toHaveBeenCalled()
  })

  it('stops registering files when unloaded between batches', async () => {
    const total = EXTRA_LIB_BATCH_SIZE + 10
    const files = Object.fromEntries(
      Array.from({ length: total }, (_, index) => [`file:///project/${index}.ts`, `export const v${index} = ${index}`])
    )
    scan.mockResolvedValue(resultFor('/project', files))

    const loading = loadProjectIntoMonaco('/project')
    await reachFirstBatch()
    expect(tsDefaults.addExtraLib).toHaveBeenCalledTimes(EXTRA_LIB_BATCH_SIZE)

    unloadProjectFromMonaco('/project')
    await vi.runAllTimersAsync()
    await loading

    expect(tsDefaults.addExtraLib).toHaveBeenCalledTimes(EXTRA_LIB_BATCH_SIZE)
  })
})
