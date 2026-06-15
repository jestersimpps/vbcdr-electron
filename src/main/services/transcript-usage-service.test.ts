import { describe, it, expect } from 'vitest'
import { contextCapForModel } from './transcript-usage-service'

describe('contextCapForModel', () => {
  it('maps opus/sonnet/haiku to 200k', () => {
    expect(contextCapForModel('claude-opus-4-8')).toBe(200_000)
    expect(contextCapForModel('claude-sonnet-4-6')).toBe(200_000)
    expect(contextCapForModel('claude-haiku-4-5-20251001')).toBe(200_000)
  })

  it('maps the [1m] variant to 1M', () => {
    expect(contextCapForModel('claude-opus-4-8[1m]')).toBe(1_000_000)
  })

  it('defaults to 200k for unknown / null', () => {
    expect(contextCapForModel(null)).toBe(200_000)
    expect(contextCapForModel('some-other-model')).toBe(200_000)
  })
})
