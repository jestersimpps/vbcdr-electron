import { sweepScrollback } from '@main/services/terminal-scrollback'

export const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

let sweepTimer: NodeJS.Timeout | null = null

/**
 * Runs the scrollback sweep once a day for as long as the app is open.
 *
 * A sweep at startup alone would never fire for the sessions that need it most:
 * this app is left running for weeks, accumulating a file per terminal that ever
 * exited. The interval is unref'd so a pending sweep cannot hold the process
 * alive during quit.
 */
export function startScrollbackSweeps(): void {
  if (sweepTimer) return
  sweepScrollback()
  sweepTimer = setInterval(() => sweepScrollback(), SWEEP_INTERVAL_MS)
  sweepTimer.unref?.()
}

export function stopScrollbackSweeps(): void {
  if (!sweepTimer) return
  clearInterval(sweepTimer)
  sweepTimer = null
}
