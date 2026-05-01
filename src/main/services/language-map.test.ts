import { describe, it, expect } from 'vitest'
import { EXT_TO_LANGUAGE } from './language-map'

describe('language-map', () => {
  it('maps common typescript extensions to TypeScript', () => {
    expect(EXT_TO_LANGUAGE.ts).toBe('TypeScript')
    expect(EXT_TO_LANGUAGE.tsx).toBe('TypeScript')
    expect(EXT_TO_LANGUAGE.mts).toBe('TypeScript')
    expect(EXT_TO_LANGUAGE.cts).toBe('TypeScript')
  })

  it('maps common javascript extensions to JavaScript', () => {
    expect(EXT_TO_LANGUAGE.js).toBe('JavaScript')
    expect(EXT_TO_LANGUAGE.jsx).toBe('JavaScript')
    expect(EXT_TO_LANGUAGE.mjs).toBe('JavaScript')
    expect(EXT_TO_LANGUAGE.cjs).toBe('JavaScript')
  })

  it('groups all C++ extensions together', () => {
    for (const ext of ['cc', 'cpp', 'cxx', 'hpp']) {
      expect(EXT_TO_LANGUAGE[ext]).toBe('C++')
    }
  })

  it('groups shell variants under Shell', () => {
    for (const ext of ['sh', 'bash', 'zsh', 'fish']) {
      expect(EXT_TO_LANGUAGE[ext]).toBe('Shell')
    }
  })

  it('returns undefined for unknown extensions', () => {
    expect(EXT_TO_LANGUAGE.unknown).toBeUndefined()
    expect(EXT_TO_LANGUAGE['']).toBeUndefined()
  })

  it('uses lowercase extension keys', () => {
    for (const key of Object.keys(EXT_TO_LANGUAGE)) {
      expect(key).toBe(key.toLowerCase())
    }
  })
})
