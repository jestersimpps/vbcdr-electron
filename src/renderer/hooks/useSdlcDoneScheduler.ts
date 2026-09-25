import { useEffect, useRef } from 'react'
import { isDoneDue, useSdlcScheduleStore } from '@/stores/sdlc-schedule-store'
import { pendingDoneTicketIds, runDoneActions } from '@/lib/sdlc-handover'

const CHECK_MS = 60_000

/**
 * Runs the last column's prompt for finished tickets that have not had it yet,
 * across every project on the board, on the interval set in its header. Mounted
 * at the app root beside the stage watcher so it keeps running while the board
 * is not on screen.
 */
export function useSdlcDoneScheduler(): void {
  const inFlight = useRef(false)

  useEffect(() => {
    const tick = async (): Promise<void> => {
      if (inFlight.current) return
      const now = Date.now()
      const { schedule, markRun } = useSdlcScheduleStore.getState()
      if (!isDoneDue(schedule, now)) return
      inFlight.current = true
      try {
        markRun(now)
        await runDoneActions(pendingDoneTicketIds(), 'timer')
      } finally {
        inFlight.current = false
      }
    }
    const timer = setInterval(() => void tick(), CHECK_MS)
    return () => clearInterval(timer)
  }, [])
}
