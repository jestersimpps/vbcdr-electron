import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SdlcDoneSchedule {
  intervalMinutes: number
  lastRunAt: number
}

export interface DoneTimerOption {
  minutes: number
  label: string
}

export const DONE_TIMER_OPTIONS: readonly DoneTimerOption[] = [
  { minutes: 0, label: 'Timer off' },
  { minutes: 15, label: 'Every 15 min' },
  { minutes: 30, label: 'Every 30 min' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 180, label: 'Every 3 hours' },
  { minutes: 720, label: 'Every 12 hours' },
  { minutes: 1440, label: 'Every day' }
]

interface SdlcScheduleState {
  schedulePerProject: Record<string, SdlcDoneSchedule>
  setDoneInterval: (projectId: string, minutes: number) => void
  markRun: (projectId: string, at: number) => void
}

/** Starting a timer counts as a run, so the first one fires a full interval later rather than the moment it is switched on. */
export const useSdlcScheduleStore = create<SdlcScheduleState>()(
  persist(
    (set) => ({
      schedulePerProject: {},

      setDoneInterval: (projectId: string, minutes: number) => {
        set((state) => {
          const schedulePerProject = { ...state.schedulePerProject }
          if (minutes > 0) schedulePerProject[projectId] = { intervalMinutes: minutes, lastRunAt: Date.now() }
          else delete schedulePerProject[projectId]
          return { schedulePerProject }
        })
      },

      markRun: (projectId: string, at: number) => {
        set((state) => {
          const current = state.schedulePerProject[projectId]
          if (!current) return state
          return { schedulePerProject: { ...state.schedulePerProject, [projectId]: { ...current, lastRunAt: at } } }
        })
      }
    }),
    { name: 'vbcdr-sdlc-schedule' }
  )
)

export function dueProjectIds(schedules: Record<string, SdlcDoneSchedule>, now: number): string[] {
  return Object.entries(schedules)
    .filter(([, s]) => s.intervalMinutes > 0 && now - s.lastRunAt >= s.intervalMinutes * 60_000)
    .map(([projectId]) => projectId)
}
