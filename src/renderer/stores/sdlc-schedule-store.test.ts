import { beforeEach, describe, expect, it } from 'vitest'
import { isDoneDue, scheduleFromLegacy, useSdlcScheduleStore } from './sdlc-schedule-store'

beforeEach(() => {
  useSdlcScheduleStore.setState({ schedule: null })
})

describe('done prompt timer', () => {
  it('counts switching it on as a run, so it fires a full interval later', () => {
    useSdlcScheduleStore.getState().setDoneInterval(60)
    const { schedule } = useSdlcScheduleStore.getState()
    const startedAt = schedule!.lastRunAt
    expect(isDoneDue(schedule, startedAt + 59 * 60_000)).toBe(false)
    expect(isDoneDue(schedule, startedAt + 60 * 60_000)).toBe(true)
  })

  it('switching it off forgets the schedule', () => {
    const store = useSdlcScheduleStore.getState()
    store.setDoneInterval(15)
    store.setDoneInterval(0)
    expect(useSdlcScheduleStore.getState().schedule).toBeNull()
    expect(isDoneDue(null, Date.now())).toBe(false)
  })

  it('a run pushes the next one out by the interval', () => {
    useSdlcScheduleStore.setState({ schedule: { intervalMinutes: 15, lastRunAt: 0 } })
    useSdlcScheduleStore.getState().markRun(15 * 60_000)
    expect(isDoneDue(useSdlcScheduleStore.getState().schedule, 20 * 60_000)).toBe(false)
  })

  it('adopts the most frequent of the per-project timers it replaced', () => {
    expect(
      scheduleFromLegacy({
        p1: { intervalMinutes: 60, lastRunAt: 5 },
        p2: { intervalMinutes: 15, lastRunAt: 7 }
      })
    ).toEqual({ intervalMinutes: 15, lastRunAt: 7 })
    expect(scheduleFromLegacy({})).toBeNull()
  })
})
