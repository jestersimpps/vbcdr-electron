import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Play, RotateCcw, UserCheck, Workflow } from 'lucide-react'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { moveTicketOn, rerunStage, SDLC_TAB_COLOR } from '@/lib/sdlc-handover'
import { ticketTransition } from '@/lib/sdlc-transitions'
import type { SdlcTicket } from '@/models/sdlc'
import { ToolbarButton } from '@/components/ui/ToolbarButton'

interface SdlcStageBarProps {
  tabId: string | null
}

function StatusChip({ ticket }: { ticket: SdlcTicket }): React.ReactElement {
  switch (ticket.status) {
    case 'running':
      return (
        <span className="flex items-center gap-1 text-micro text-amber-400">
          <Loader2 size={10} className="animate-spin" />
          agent working
        </span>
      )
    case 'awaiting-approval':
      return (
        <span className="flex items-center gap-1 text-micro text-sky-400">
          <UserCheck size={10} />
          result ready
        </span>
      )
    case 'blocked':
    case 'failed':
      return (
        <span className="flex items-center gap-1 text-micro text-red-400" title={ticket.blockedReason ?? undefined}>
          <AlertTriangle size={10} />
          {ticket.blockedReason ?? ticket.status}
        </span>
      )
    default:
      return <span className="text-micro text-zinc-500">idle</span>
  }
}

/**
 * Renders only for a tab that an SDLC ticket owns, so it is the strongest
 * visual signal that a tab is board-driven. Same nullable-tabId contract as
 * TaskQueuePanel, mounted beside it.
 */
export function SdlcStageBar({ tabId }: SdlcStageBarProps): React.ReactElement | null {
  const ticket = useSdlcStore((s) => (tabId ? s.tickets.find((t) => t.tabId === tabId) : undefined))
  const showSdlcPage = useProjectStore((s) => s.showSdlcPage)
  const tab = useTerminalStore((s) => (tabId ? s.tabs.find((t) => t.id === tabId) : undefined))
  const columns = useSdlcFlowStore((s) => s.columns)

  if (!ticket || !tab) return null

  const { column, next, finishes, isAgent, moveOnLabel, moveOnBlockedReason } = ticketTransition(ticket, columns)
  const isRunning = ticket.status === 'running'
  const moveOn = (): void => void moveTicketOn(ticket.id)

  return (
    <div
      className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/60 px-2 py-1"
      style={{ boxShadow: `inset 3px 0 0 0 ${SDLC_TAB_COLOR}` }}
    >
      <Workflow size={12} className="shrink-0" style={{ color: SDLC_TAB_COLOR }} />
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-zinc-300">
        {column.label}
      </span>
      <span className="min-w-0 truncate text-xs text-zinc-200" title={ticket.title}>
        {ticket.title}
      </span>
      <StatusChip ticket={ticket} />
      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton onClick={showSdlcPage} title="Open on the board">
          <ExternalLink size={12} />
        </ToolbarButton>
        {isAgent && (
          <ToolbarButton
            onClick={() => void rerunStage(ticket.id)}
            disabled={isRunning}
            title="Run this stage again in a fresh tab"
          >
            <RotateCcw size={12} />
          </ToolbarButton>
        )}
        {next && (
          <button
            onClick={moveOn}
            disabled={!!moveOnBlockedReason}
            className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            title={
              moveOnBlockedReason ??
              (finishes ? 'Remove the worktree, keep the work on its branch and mark the ticket done' : undefined)
            }
          >
            {finishes ? <CheckCircle2 size={11} /> : <Play size={11} />}
            {moveOnLabel}
          </button>
        )}
      </div>
    </div>
  )
}
