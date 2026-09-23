import { beforeEach, describe, expect, it } from 'vitest'
import { dueProjectIds, useSdlcScheduleStore } from './sdlc-schedule-store'

beforeEach(() => {
  useSdlcScheduleStore.setState({ schedulePerProject: {} })
})

describe('done prompt timer', () => {
  it('counts switching it on as a run, so it fires a full interval later', () => {
    useSdlcScheduleStore.getState().setDoneInterval('p1', 60)
    const { schedulePerProject } = useSdlcScheduleStore.getState()
    const startedAt = schedulePerProject.p1.lastRunAt
    expect(dueProjectIds(schedulePerProject, startedAt + 59 * 60_000)).toEqual([])
    expect(dueProjectIds(schedulePerProject, startedAt + 60 * 60_000)).toEqual(['p1'])
  })

  it('switching it off forgets the project', () => {
    const store = useSdlcScheduleStore.getState()
    store.setDoneInterval('p1', 15)
    store.setDoneInterval('p1', 0)
    expect(useSdlcScheduleStore.getState().schedulePerProject).toEqual({})
  })

  it('a run pushes the next one out by the interval', () => {
    useSdlcScheduleStore.setState({ schedulePerProject: { p1: { intervalMinutes: 15, lastRunAt: 0 } } })
    useSdlcScheduleStore.getState().markRun('p1', 15 * 60_000)
    expect(dueProjectIds(useSdlcScheduleStore.getState().schedulePerProject, 20 * 60_000)).toEqual([])
  })
})
