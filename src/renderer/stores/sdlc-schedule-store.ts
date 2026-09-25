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
  /** Null while the timer is off. One board, one timer: it covers every project's finished tickets. */
  schedule: SdlcDoneSchedule | null
  setDoneInterval: (minutes: number) => void
  markRun: (at: number) => void
}

interface LegacySchedules {
  schedulePerProject?: Record<string, SdlcDoneSchedule>
}

/** The timer used to be set per project, in each swimlane's header; the most frequent of those becomes the board's one timer. */
export function scheduleFromLegacy(schedules: Record<string, SdlcDoneSchedule>): SdlcDoneSchedule | null {
  const running = Object.values(schedules).filter((s) => s.intervalMinutes > 0)
  if (running.length === 0) return null
  return running.reduce((fastest, s) => (s.intervalMinutes < fastest.intervalMinutes ? s : fastest))
}

/** Starting a timer counts as a run, so the first one fires a full interval later rather than the moment it is switched on. */
export const useSdlcScheduleStore = create<SdlcScheduleState>()(
  persist(
    (set) => ({
      schedule: null,

      setDoneInterval: (minutes: number) => {
        set({ schedule: minutes > 0 ? { intervalMinutes: minutes, lastRunAt: Date.now() } : null })
      },

      markRun: (at: number) => {
        set((state) => (state.schedule ? { schedule: { ...state.schedule, lastRunAt: at } } : state))
      }
    }),
    {
      name: 'vbcdr-sdlc-schedule',
      partialize: (state) => ({ schedule: state.schedule }),
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<SdlcScheduleState> & LegacySchedules
        const schedule =
          incoming.schedule !== undefined
            ? incoming.schedule
            : scheduleFromLegacy(incoming.schedulePerProject ?? {})
        return { ...current, schedule }
      }
    }
  )
)

export function isDoneDue(schedule: SdlcDoneSchedule | null, now: number): boolean {
  if (!schedule || schedule.intervalMinutes <= 0) return false
  return now - schedule.lastRunAt >= schedule.intervalMinutes * 60_000
}
