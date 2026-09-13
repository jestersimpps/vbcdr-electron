import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins simple class strings', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('skips falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('lets later tailwind classes override earlier conflicting ones', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('keeps non-conflicting tailwind classes', () => {
    expect(cn('text-sm', 'font-bold')).toBe('text-sm font-bold')
  })

  it('keeps semantic text sizes next to text colors', () => {
    expect(cn('text-micro text-zinc-400')).toBe('text-micro text-zinc-400')
  })

  it('lets a later semantic text size override an earlier one', () => {
    expect(cn('text-micro', 'text-body')).toBe('text-body')
  })

  it('handles arrays and objects via clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c')
  })
})
