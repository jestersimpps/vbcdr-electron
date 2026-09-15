import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Monaco } from '@monaco-editor/react'
import { applyDiagnosticsOptions } from './monaco-diagnostics'

interface FakeTsDefaults {
  setDiagnosticsOptions: ReturnType<typeof vi.fn>
}

interface FakeModeDefaults {
  modeConfiguration: Record<string, unknown>
  setModeConfiguration: ReturnType<typeof vi.fn>
}

const MODE_DEFAULT_KEYS = [
  'jsonDefaults', 'cssDefaults', 'scssDefaults', 'lessDefaults',
  'htmlDefaults', 'handlebarDefaults', 'razorDefaults'
] as const

function makeModeDefaults(): FakeModeDefaults {
  const defaults: FakeModeDefaults = {
    // A second key, so the test can prove the spread preserves unrelated config.
    modeConfiguration: { diagnostics: true, completionItems: true },
    setModeConfiguration: vi.fn((config: Record<string, unknown>) => {
      defaults.modeConfiguration = config
    })
  }
  return defaults
}

let tsDefaults: FakeTsDefaults
let jsDefaults: FakeTsDefaults
let modeConfigurable: Record<string, FakeModeDefaults>
let monaco: Monaco

beforeEach(() => {
  tsDefaults = { setDiagnosticsOptions: vi.fn() }
  jsDefaults = { setDiagnosticsOptions: vi.fn() }
  modeConfigurable = Object.fromEntries(
    MODE_DEFAULT_KEYS.map((key) => [key, makeModeDefaults()])
  )
  monaco = {
    languages: {
      typescript: {
        typescriptDefaults: tsDefaults,
        javascriptDefaults: jsDefaults
      },
      json: { jsonDefaults: modeConfigurable.jsonDefaults },
      css: {
        cssDefaults: modeConfigurable.cssDefaults,
        scssDefaults: modeConfigurable.scssDefaults,
        lessDefaults: modeConfigurable.lessDefaults
      },
      html: {
        htmlDefaults: modeConfigurable.htmlDefaults,
        handlebarDefaults: modeConfigurable.handlebarDefaults,
        razorDefaults: modeConfigurable.razorDefaults
      }
    }
  } as unknown as Monaco
})

describe('applyDiagnosticsOptions', () => {
  it('silences every TS/JS validator on both defaults', () => {
    applyDiagnosticsOptions(monaco)

    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenCalledOnce()
    expect(jsDefaults.setDiagnosticsOptions).toHaveBeenCalledOnce()
    expect(tsDefaults.setDiagnosticsOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true
      })
    )
    expect(jsDefaults.setDiagnosticsOptions).toHaveBeenCalledWith(
      tsDefaults.setDiagnosticsOptions.mock.calls[0][0]
    )
  })

  it('unregisters the JSON/CSS/HTML diagnostic providers, preserving other mode config', () => {
    applyDiagnosticsOptions(monaco)

    for (const defaults of Object.values(modeConfigurable)) {
      expect(defaults.setModeConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({ diagnostics: false, completionItems: true })
      )
    }
  })

  it('skips a language service that is absent from a leaner Monaco build', () => {
    const bare = {
      languages: { typescript: { typescriptDefaults: tsDefaults, javascriptDefaults: jsDefaults } }
    }

    expect(() => applyDiagnosticsOptions(bare as unknown as Monaco)).not.toThrow()
  })

  it('does not re-set mode configuration that is already off', () => {
    applyDiagnosticsOptions(monaco)
    for (const defaults of Object.values(modeConfigurable)) {
      defaults.setModeConfiguration.mockClear()
    }

    applyDiagnosticsOptions(monaco)

    for (const defaults of Object.values(modeConfigurable)) {
      expect(defaults.setModeConfiguration).not.toHaveBeenCalled()
    }
  })
})
