import { describe, it, expect } from 'vitest'
import { formatTokens, tokenBarFill } from './token-display'

describe('formatTokens', () => {
  it('leaves counts under 1k as plain digits', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('abbreviates thousands', () => {
    expect(formatTokens(1_500)).toBe('1.5k')
    expect(formatTokens(12_300)).toBe('12.3k')
  })

  it('abbreviates millions instead of overflowing the k suffix', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
  })

  it('drops the trailing zero on exact multiples', () => {
    expect(formatTokens(1_000)).toBe('1k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_000_000)).toBe('1M')
  })
})

describe('tokenBarFill', () => {
  const theme = { green: '#0f0', yellow: '#ff0', red: '#f00' }

  it('steps green to yellow to red as usage climbs', () => {
    expect(tokenBarFill(0.2, theme)).toBe('#0f0')
    expect(tokenBarFill(0.6, theme)).toBe('#ff0')
    expect(tokenBarFill(0.9, theme)).toBe('#f00')
  })

  it('falls back to defaults when the theme omits a colour', () => {
    expect(tokenBarFill(0.2, {})).toBe('#7ee787')
  })
})
