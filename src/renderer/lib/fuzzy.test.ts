import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from './fuzzy'

describe('fuzzyMatch', () => {
  it('matches everything on an empty query', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, matched: true })
  })

  it('scores a substring hit far above a subsequence hit', () => {
    const substring = fuzzyMatch('store', 'layout-store.ts')
    const subsequence = fuzzyMatch('lyt', 'layout-store.ts')
    expect(substring.matched).toBe(true)
    expect(subsequence.matched).toBe(true)
    expect(substring.score).toBeGreaterThan(subsequence.score)
  })

  it('prefers an earlier substring position', () => {
    const early = fuzzyMatch('app', 'App.tsx')
    const late = fuzzyMatch('app', 'src/renderer/App.tsx')
    expect(early.score).toBeGreaterThan(late.score)
  })

  it('is case insensitive', () => {
    expect(fuzzyMatch('APP', 'App.tsx').matched).toBe(true)
    expect(fuzzyMatch('app', 'APP.TSX').matched).toBe(true)
  })

  it('matches out-of-order characters only as a subsequence', () => {
    expect(fuzzyMatch('ats', 'App.tsx').matched).toBe(true)
    expect(fuzzyMatch('xst', 'App.tsx').matched).toBe(false)
  })

  it('rewards adjacent subsequence characters over scattered ones', () => {
    const adjacent = fuzzyMatch('ts', 'xxts')
    const scattered = fuzzyMatch('ts', 'txxs')
    expect(adjacent.score).toBeGreaterThan(scattered.score)
  })

  it('reports no match when the query is not a subsequence', () => {
    expect(fuzzyMatch('zzz', 'App.tsx')).toEqual({ score: 0, matched: false })
  })
})
