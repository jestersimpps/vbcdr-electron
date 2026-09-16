import { useEffect, useRef } from 'react'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { readSentinel } from '@/lib/sdlc-sentinel'
import { autoAdvanceTicket, recordStageOutput } from '@/lib/sdlc-handover'

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
 * A pattern match against known interactive-prompt text (trust dialogs,
 * permission menus) short-circuits that straight to blocked, since those
 * prompts appear in a couple seconds — waiting out the silence window would
 * leave the ticket reading "agent working" while it is actually stuck.
 * Blocked and failed are recoverable, not terminal: the watcher keeps reading
 * the sentinel for them and returns them to running once a prompt clears, so a
 * false positive cannot strand a stage that actually finished. Both of this
 * hook's own timeout verdicts are inferences that have proven wrong in
 * practice, so neither is allowed to be the last word.
 * Mounted once at the app root: the board itself unmounts when a handoff
 * navigates to the terminal.
 */
export function useSdlcStageWatcher(): void {
  const runs = useRef(new Map<string, TabRun>())
  const inFlight = useRef(false)
  // A handoff outlives the tick that started it; without this an auto-advancing
  // ticket would be handed off again on every poll until its stage went busy.
  const advancing = useRef(new Set<string>())

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
          const settled = ticket.status === 'blocked' || ticket.status === 'failed'
          if (ticket.status !== 'running' && !settled) continue
          if (!ticket.tabId) {
            if (settled) continue
            patchTicket(ticket.id, { status: 'failed', blockedReason: 'No agent tab was opened for this stage. Run it again.' })
            continue
          }
          const tabId = ticket.tabId

          // Read the sentinel before anything else can demote the ticket: a
          // stage that finished counts as finished even if the agent then hit a
          // prompt, or the tab was closed once the work was already written.
          const output = ticket.worktreePath !== '—' ? await readSentinel(ticket.worktreePath) : null
          if (output) {
            runs.current.delete(tabId)
            const patch = await recordStageOutput(ticket, output)
            patchTicket(ticket.id, { ...patch, status: 'awaiting-approval', blockedReason: null })
            if (ticket.autoAdvance && !advancing.current.has(ticket.id)) {
              advancing.current.add(ticket.id)
              void autoAdvanceTicket(ticket.id).finally(() => advancing.current.delete(ticket.id))
            }
            continue
          }

          if (!liveTabIds.has(tabId)) {
            runs.current.delete(tabId)
            if (!settled) {
              patchTicket(ticket.id, { status: 'blocked', blockedReason: 'The agent tab was closed before the stage finished.' })
            }
            continue
          }

          const promptWaiting = useTerminalStore.getState().promptDetectedTabIds[tabId]

          // A settled (blocked/failed) ticket is only ever revisited to recover
          // it: the sentinel check above can complete it, and a cleared prompt
          // returns it to running. The timeout paths below must not fire, or a
          // ticket legitimately waiting on the user would decay further.
          if (settled) {
            if (!promptWaiting && ticket.blockedReason?.includes('waiting on a prompt')) {
              patchTicket(ticket.id, { status: 'running', blockedReason: null })
            }
            continue
          }

          if (promptWaiting) {
            runs.current.delete(tabId)
            patchTicket(ticket.id, {
              status: 'blocked',
              blockedReason: 'The agent is waiting on a prompt in its terminal — open the tab to answer it.'
            })
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
