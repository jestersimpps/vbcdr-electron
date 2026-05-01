import { beforeEach, describe, expect, it } from 'vitest'
import { useStatsStore } from './stats-store'

const resetStore = (): void => {
  useStatsStore.setState({
    range: 'week',
    gapMinutes: 30,
    leadInMinutes: 15,
    includeAllAuthors: false,
    source: 'terminal',
    idleMinutes: 5
  })
}

describe('stats-store', () => {
  beforeEach(resetStore)

  it('exposes the documented defaults', () => {
    const s = useStatsStore.getState()
    expect(s.range).toBe('week')
    expect(s.gapMinutes).toBe(30)
    expect(s.leadInMinutes).toBe(15)
    expect(s.includeAllAuthors).toBe(false)
    expect(s.source).toBe('terminal')
    expect(s.idleMinutes).toBe(5)
  })

  it('updates the time range', () => {
    useStatsStore.getState().setRange('day')
    expect(useStatsStore.getState().range).toBe('day')
    useStatsStore.getState().setRange('month')
    expect(useStatsStore.getState().range).toBe('month')
  })

  it('updates the numeric session knobs', () => {
    useStatsStore.getState().setGapMinutes(60)
    useStatsStore.getState().setLeadInMinutes(5)
    useStatsStore.getState().setIdleMinutes(10)
    const s = useStatsStore.getState()
    expect(s.gapMinutes).toBe(60)
    expect(s.leadInMinutes).toBe(5)
    expect(s.idleMinutes).toBe(10)
  })

  it('toggles includeAllAuthors and switches source', () => {
    useStatsStore.getState().setIncludeAllAuthors(true)
    expect(useStatsStore.getState().includeAllAuthors).toBe(true)
    useStatsStore.getState().setIncludeAllAuthors(false)
    expect(useStatsStore.getState().includeAllAuthors).toBe(false)

    useStatsStore.getState().setSource('git')
    expect(useStatsStore.getState().source).toBe('git')
    useStatsStore.getState().setSource('terminal')
    expect(useStatsStore.getState().source).toBe('terminal')
  })

  it('leaves unrelated fields untouched on a single setter call', () => {
    useStatsStore.getState().setRange('day')
    const s = useStatsStore.getState()
    expect(s.gapMinutes).toBe(30)
    expect(s.leadInMinutes).toBe(15)
    expect(s.idleMinutes).toBe(5)
    expect(s.source).toBe('terminal')
    expect(s.includeAllAuthors).toBe(false)
  })
})
