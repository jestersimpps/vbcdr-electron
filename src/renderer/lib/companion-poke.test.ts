import { describe, it, expect } from 'vitest'
import { CompanionPoker } from './companion-poke'
import { COMPANION_POKES, POKE_RESET_MS } from '@/config/companion-poke-registry'

function fixedClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

describe('CompanionPoker', () => {
  it('escalates through the tiers as the clicking continues', () => {
    const clock = fixedClock()
    const poker = new CompanionPoker(clock.now, () => 0)
    const tiers: number[] = []
    for (let i = 0; i < 3; i++) {
      tiers.push(poker.poke().tier)
      clock.advance(300)
    }
    expect(tiers).toEqual([0, 1, 2])
  })

  it('stays on the last tier rather than running off the end', () => {
    const clock = fixedClock()
    const poker = new CompanionPoker(clock.now, () => 0)
    let last = -1
    for (let i = 0; i < 8; i++) {
      last = poker.poke().tier
      clock.advance(300)
    }
    expect(last).toBe(COMPANION_POKES.length - 1)
  })

  it('softens again after a quiet gap', () => {
    const clock = fixedClock()
    const poker = new CompanionPoker(clock.now, () => 0)
    poker.poke()
    poker.poke()
    clock.advance(POKE_RESET_MS + 1)
    expect(poker.poke().tier).toBe(0)
  })

  it('never hands back the same line twice in a row within a tier', () => {
    const clock = fixedClock()
    const poker = new CompanionPoker(clock.now, () => 0)
    const first = poker.poke().line
    clock.advance(POKE_RESET_MS + 1)
    const second = poker.poke().line
    expect(second).not.toEqual(first)
    expect(COMPANION_POKES[0].lines).toContainEqual(second)
  })
})
