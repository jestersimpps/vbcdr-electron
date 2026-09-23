import { useEffect, useRef } from 'react'
import { dueProjectIds, useSdlcScheduleStore } from '@/stores/sdlc-schedule-store'
import { pendingDoneTicketIds, runDoneActions } from '@/lib/sdlc-handover'

const CHECK_MS = 60_000

/**
 * Runs the last column's prompt for finished tickets that have not had it yet,
 * per project, on the interval set on the board. Mounted at the app root beside
 * the stage watcher so it keeps running while the board is not on screen.
 */
export function useSdlcDoneScheduler(): void {
  const inFlight = useRef(false)

  useEffect(() => {
    const tick = async (): Promise<void> => {
      if (inFlight.current) return
      const now = Date.now()
      const { schedulePerProject, markRun } = useSdlcScheduleStore.getState()
      const due = dueProjectIds(schedulePerProject, now)
      if (due.length === 0) return
      inFlight.current = true
      try {
        for (const projectId of due) {
          markRun(projectId, now)
          await runDoneActions(pendingDoneTicketIds(projectId))
        }
      } finally {
        inFlight.current = false
      }
    }
    const timer = setInterval(() => void tick(), CHECK_MS)
    return () => clearInterval(timer)
  }, [])
}
