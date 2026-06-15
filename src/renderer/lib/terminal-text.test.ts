import { describe, it, expect } from 'vitest'
import { parseTokenCount } from './terminal-text'

describe('parseTokenCount', () => {
  it('parses plain integers', () => {
    expect(parseTokenCount('250000 tokens')).toBe(250000)
  })

  it('parses comma-grouped numbers', () => {
    expect(parseTokenCount('250,000 tokens')).toBe(250000)
  })

  it('parses k suffix', () => {
    expect(parseTokenCount('25k tokens')).toBe(25000)
    expect(parseTokenCount('1.2k tokens')).toBe(1200)
  })

  it('parses m suffix', () => {
    expect(parseTokenCount('1.5m tokens')).toBe(1500000)
  })

  it('does not mangle decimals (regression: 1.2 must not become 12)', () => {
    expect(parseTokenCount('1.2 tokens')).toBe(1)
  })

  it('matches singular token', () => {
    expect(parseTokenCount('1 token')).toBe(1)
  })

  it('returns null when no token count present', () => {
    expect(parseTokenCount('Context left until auto-compact: 23%')).toBeNull()
    expect(parseTokenCount('just some text')).toBeNull()
  })
})
