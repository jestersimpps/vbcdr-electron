import { useEffect, useRef } from 'react'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { readSentinel } from '@/lib/sdlc-sentinel'
import { recordStageOutput } from '@/lib/sdlc-handover'

const POLL_MS = 3000
const QUIET_BEFORE_BLOCKED_MS = 45_000
const NEVER_BUSY_TIMEOUT_MS = 90_000

interface TabRun {
  startedAt: number
  wentBusy: boolean
  idleSince: number | null
}

/**
 * The sentinel file is the only real completion signal. Terminal idle/busy is
 * inferred from output timing and cannot tell "done" from "asked a question",
 * so it only ever demotes a ticket to needing attention, never promotes it.
 * Mounted once at the app root: the board itself unmounts when a handoff
 * navigates to the terminal.
 */
export function useSdlcStageWatcher(): void {
  const runs = useRef(new Map<string, TabRun>())
  const inFlight = useRef(false)

  useEffect(() => {
    const tick = async (): Promise<void> => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const { tickets, patchTicket } = useSdlcStore.getState()
        const { tabs, tabStatuses } = useTerminalStore.getState()
        const now = Date.now()
        const liveTabIds = new Set(tabs.map((t) => t.id))

        for (const ticket of tickets) {
          if (ticket.status !== 'running') continue
          if (!ticket.tabId) {
            patchTicket(ticket.id, { status: 'failed', blockedReason: 'No agent tab was opened for this stage. Run it again.' })
            continue
          }
          const tabId = ticket.tabId

          if (!liveTabIds.has(tabId)) {
            runs.current.delete(tabId)
            patchTicket(ticket.id, { status: 'blocked', blockedReason: 'The agent tab was closed before the stage finished.' })
            continue
          }

          const output = ticket.worktreePath !== '—' ? await readSentinel(ticket.worktreePath) : null
          if (output) {
            runs.current.delete(tabId)
            const patch = await recordStageOutput(ticket, output)
            patchTicket(ticket.id, { ...patch, status: 'awaiting-approval', blockedReason: null })
            continue
          }

          const run = runs.current.get(tabId) ?? { startedAt: now, wentBusy: false, idleSince: null }
          const status = tabStatuses[tabId]
          if (status === 'busy') {
            run.wentBusy = true
            run.idleSince = null
          } else if (status === 'idle') {
            run.idleSince ??= now
          }
          runs.current.set(tabId, run)

          if (!run.wentBusy && now - run.startedAt > NEVER_BUSY_TIMEOUT_MS) {
            runs.current.delete(tabId)
            patchTicket(ticket.id, { status: 'failed', blockedReason: 'The prompt never reached the agent. Check the terminal tab.' })
          } else if (run.wentBusy && run.idleSince !== null && now - run.idleSince > QUIET_BEFORE_BLOCKED_MS) {
            runs.current.delete(tabId)
            patchTicket(ticket.id, { status: 'blocked', blockedReason: 'The agent went quiet without writing its result. It may be waiting for you.' })
          }
        }
      } finally {
        inFlight.current = false
      }
    }

    const timer = setInterval(() => void tick(), POLL_MS)
    return () => clearInterval(timer)
  }, [])
}
