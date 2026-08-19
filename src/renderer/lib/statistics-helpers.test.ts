import { describe, it, expect, vi, afterEach } from 'vitest'
import { historyRange } from './statistics-helpers'

const DAY = 86_400_000

describe('historyRange last7', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('spans exactly seven days ending today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 19, 14, 30))

    const r = historyRange('last7', null, null)
    const start = new Date(r.start)
    const end = new Date(r.end)

    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(13)
    expect(start.getHours()).toBe(0)

    expect(end.getDate()).toBe(19)
    expect(r.end - r.start).toBeCloseTo(7 * DAY - 1, -2)
  })

  it('rolls back across a month boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 9, 0))

    const start = new Date(historyRange('last7', null, null).start)
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(28)
  })

  it('reaches back further than the calendar week on a Monday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 17, 10, 0))

    const last7 = historyRange('last7', null, null)
    const week = historyRange('week', null, null)
    expect(new Date(week.start).getDate()).toBe(17)
    expect(new Date(last7.start).getDate()).toBe(11)
    expect(last7.start).toBeLessThan(week.start)
  })

  it('ends no later than the end of today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 19, 1, 0))

    const r = historyRange('last7', null, null)
    expect(r.end).toBe(r.windowEnd)
  })
})
