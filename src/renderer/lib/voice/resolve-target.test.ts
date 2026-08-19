import { describe, it, expect } from 'vitest'
import {
  parseOrdinal,
  resolveByName,
  resolveByOrdinalOrName,
  resolveFilePath
} from './resolve-target'

const PROJECTS = [
  { value: 'p1', label: 'vibecoder' },
  { value: 'p2', label: 'petsitters' },
  { value: 'p3', label: 'polymarket' }
]

describe('parseOrdinal', () => {
  it('parses ordinal words', () => {
    expect(parseOrdinal('first')).toBe(1)
    expect(parseOrdinal('second')).toBe(2)
    expect(parseOrdinal('third')).toBe(3)
  })

  it('parses cardinal words as positions', () => {
    expect(parseOrdinal('one')).toBe(1)
    expect(parseOrdinal('two')).toBe(2)
  })

  it('parses digits and nth forms', () => {
    expect(parseOrdinal('3')).toBe(3)
    expect(parseOrdinal('2nd')).toBe(2)
    expect(parseOrdinal('4th')).toBe(4)
  })

  it('returns null for non-ordinals', () => {
    expect(parseOrdinal('petsitters')).toBeNull()
    expect(parseOrdinal('')).toBeNull()
    expect(parseOrdinal('0')).toBeNull()
  })
})

describe('resolveByName', () => {
  it('resolves an exact name', () => {
    expect(resolveByName('petsitters', PROJECTS)).toBe('p2')
  })

  it('is case insensitive', () => {
    expect(resolveByName('PetSitters', PROJECTS)).toBe('p2')
  })

  it('resolves a fuzzy name', () => {
    expect(resolveByName('petsit', PROJECTS)).toBe('p2')
  })

  it('prefers an exact match over a fuzzy one', () => {
    const candidates = [
      { value: 'long', label: 'petsitters-legacy' },
      { value: 'exact', label: 'petsitters' }
    ]
    expect(resolveByName('petsitters', candidates)).toBe('exact')
  })

  it('resolves via an alias', () => {
    const tabs = [
      { value: 't1', label: 'Terminal 1' },
      { value: 't2', label: 'LLM', aliases: ['llm', 'Claude Code'] }
    ]
    expect(resolveByName('claude code', tabs)).toBe('t2')
    expect(resolveByName('llm', tabs)).toBe('t2')
  })

  it('returns null when nothing resembles the target', () => {
    expect(resolveByName('zzzzz', PROJECTS)).toBeNull()
  })

  it('returns null for an empty target', () => {
    expect(resolveByName('   ', PROJECTS)).toBeNull()
  })
})

describe('resolveByOrdinalOrName', () => {
  it('resolves an ordinal to a position', () => {
    expect(resolveByOrdinalOrName('second', PROJECTS)).toBe('p2')
    expect(resolveByOrdinalOrName('3', PROJECTS)).toBe('p3')
  })

  it('returns null for an out-of-range ordinal rather than clamping', () => {
    expect(resolveByOrdinalOrName('ninth', PROJECTS)).toBeNull()
  })

  it('falls back to name resolution', () => {
    expect(resolveByOrdinalOrName('polymarket', PROJECTS)).toBe('p3')
  })
})

const FILES = [
  { path: '/repo/src/renderer/stores/layout-store.ts', name: 'layout-store.ts' },
  { path: '/repo/src/renderer/App.tsx', name: 'App.tsx' },
  { path: '/repo/src/main/index.ts', name: 'index.ts' }
]

describe('resolveFilePath', () => {
  it('resolves an exact path', () => {
    expect(resolveFilePath('/repo/src/main/index.ts', FILES)).toBe('/repo/src/main/index.ts')
  })

  it('resolves an exact basename', () => {
    expect(resolveFilePath('App.tsx', FILES)).toBe('/repo/src/renderer/App.tsx')
  })

  it('resolves spoken names with spaces for separators', () => {
    expect(resolveFilePath('layout store ts', FILES)).toBe(
      '/repo/src/renderer/stores/layout-store.ts'
    )
  })

  it('resolves a fuzzy basename', () => {
    expect(resolveFilePath('layout', FILES)).toBe('/repo/src/renderer/stores/layout-store.ts')
  })

  it('falls back to matching against the full path', () => {
    expect(resolveFilePath('renderer/stores', FILES)).toBe(
      '/repo/src/renderer/stores/layout-store.ts'
    )
  })

  it('returns null when nothing matches, never a nearest guess', () => {
    expect(resolveFilePath('qqqqzzz', FILES)).toBeNull()
  })

  it('returns null for an empty target', () => {
    expect(resolveFilePath('', FILES)).toBeNull()
  })
})
