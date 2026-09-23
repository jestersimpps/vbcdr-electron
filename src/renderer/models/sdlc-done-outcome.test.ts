import { describe, it, expect } from 'vitest'
import { resolveDoneOutcome } from './sdlc-done-outcome'

describe('resolveDoneOutcome', () => {
  it('reads the outcome line of the report', () => {
    expect(resolveDoneOutcome('OUTCOME: branch\npushed it', 'none')).toBe('branch')
    expect(resolveDoneOutcome('  outcome: No-PR\nnothing to do', 'unknown')).toBe('no-pr')
  })

  it('finds the outcome line even when the agent put something above it', () => {
    expect(resolveDoneOutcome('# Report\n\nOUTCOME: merged', 'none')).toBe('merged')
  })

  it('trusts the pull request state gh reports over the agent', () => {
    expect(resolveDoneOutcome('OUTCOME: no-pr', 'open')).toBe('pr')
    expect(resolveDoneOutcome('OUTCOME: pr', 'merged')).toBe('merged')
  })

  it('falls back to no pull request when the report says nothing usable', () => {
    expect(resolveDoneOutcome('done', 'none')).toBe('no-pr')
    expect(resolveDoneOutcome('OUTCOME: shipped', 'closed')).toBe('no-pr')
  })
})
