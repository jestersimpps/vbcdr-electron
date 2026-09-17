import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, GitPullRequest, Loader2, Play, RotateCcw, UserCheck, Workflow } from 'lucide-react'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { moveTicketOn, rerunStage, SDLC_TAB_COLOR } from '@/lib/sdlc-handover'
import { WRAP_UP_LABEL, ticketTransition } from '@/lib/sdlc-transitions'
import type { SdlcTicket } from '@/models/sdlc'
import { CloseWorktreeTabModal } from '@/components/terminal/CloseWorktreeTabModal'
import { ToolbarButton } from '@/components/ui/ToolbarButton'
import { cn } from '@/lib/utils'

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
  const selectTicket = useSdlcStore((s) => s.selectTicket)
  const showSdlcPage = useProjectStore((s) => s.showSdlcPage)
  const tab = useTerminalStore((s) => (tabId ? s.tabs.find((t) => t.id === tabId) : undefined))
  const columns = useSdlcFlowStore((s) => s.columns)
  const [wrapUpOpen, setWrapUpOpen] = useState(false)

  if (!ticket || !tab) return null

  const { column, next, wrapsUp, finishes, isAgent, moveOnLabel, moveOnBlockedReason, outputBlockedReason } =
    ticketTransition(ticket, columns)
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
        <ToolbarButton
          onClick={() => {
            selectTicket(ticket.id)
            showSdlcPage()
          }}
          title="Open on the board"
        >
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
        {next && wrapsUp && (
          <ToolbarButton
            onClick={moveOn}
            disabled={!!moveOnBlockedReason}
            title={finishes ? 'After the PR is open: remove the worktree and mark the ticket done' : moveOnLabel}
          >
            {finishes ? <CheckCircle2 size={12} /> : <Play size={12} />}
          </ToolbarButton>
        )}
        {next && (
          <button
            onClick={wrapsUp ? () => setWrapUpOpen(true) : moveOn}
            disabled={wrapsUp ? !!outputBlockedReason || !tab.worktree : !!moveOnBlockedReason}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white disabled:opacity-40',
              'bg-indigo-600 hover:bg-indigo-500'
            )}
            title={wrapsUp ? outputBlockedReason : moveOnBlockedReason}
          >
            {wrapsUp ? <GitPullRequest size={11} /> : finishes ? <CheckCircle2 size={11} /> : <Play size={11} />}
            {wrapsUp ? WRAP_UP_LABEL : moveOnLabel}
          </button>
        )}
      </div>
      {wrapUpOpen && tab.worktree && (
        <CloseWorktreeTabModal tab={tab} worktree={tab.worktree} onCancel={() => setWrapUpOpen(false)} />
      )}
    </div>
  )
}
