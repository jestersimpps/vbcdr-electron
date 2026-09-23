import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FolderOpen,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Terminal,
  Timer,
  Trash2,
  UserCheck,
  Workflow,
  X
} from 'lucide-react'
import type { SdlcTicket, SdlcTicketStatus } from '@/models/sdlc'
import { hasCommand, type SdlcColumn } from '@/models/sdlc-flow'
import { useProjectStore } from '@/stores/project-store'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useNow } from '@/hooks/useNow'
import { useTerminalStore } from '@/stores/terminal-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { DONE_TIMER_OPTIONS, useSdlcScheduleStore } from '@/stores/sdlc-schedule-store'
import {
  discardTicket,
  focusTicketTab,
  moveTicketOn,
  removeFinishedTicket,
  rerunStage,
  runDoneAction,
  runDoneActions
} from '@/lib/sdlc-handover'
import { useAccent } from '@/components/settings/SettingsControls'
import { NewTicketComposer } from '@/components/sdlc/NewTicketComposer'
import { TicketLocation } from '@/components/sdlc/TicketLocation'
import { TicketAttachments } from '@/components/sdlc/TicketAttachments'
import { cn } from '@/lib/utils'

const LANE_MIN_WIDTH = 'min-w-[220px]'

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function RelativeTime({ timestamp }: { timestamp: number }): React.ReactElement {
  const now = useNow()
  return <span className="text-micro text-zinc-600">{relativeTime(timestamp, now)}</span>
}

function StatusBadge({ status }: { status: SdlcTicketStatus }): React.ReactElement | null {
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1 text-micro text-amber-400">
        <Loader2 size={10} className="animate-spin" />
        running
      </span>
    )
  }
  if (status === 'blocked') {
    return (
      <span className="flex items-center gap-1 text-micro text-orange-400">
        <AlertTriangle size={10} />
        blocked
      </span>
    )
  }
  if (status === 'awaiting-approval') {
    return (
      <span className="flex items-center gap-1 text-micro text-sky-400">
        <UserCheck size={10} />
        needs you
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-micro text-red-400">
        <X size={10} />
        failed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-micro text-zinc-600">
      <CircleDot size={10} />
      idle
    </span>
  )
}

type TicketPlace = 'start' | 'agent' | 'end'

const CARD_BUTTON =
  'flex items-center gap-1 rounded px-1.5 py-0.5 text-micro text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200'

/** A finished ticket's branch holds the work, so removing it only takes it off the board. */
function removeTicket(ticket: SdlcTicket, place: TicketPlace): void {
  void (place === 'end' ? removeFinishedTicket(ticket.id) : discardTicket(ticket.id))
}

function AccentButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  const accent = useAccent()
  return (
    <button
      {...props}
      className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: accent, color: accent }}
    />
  )
}

function TicketActions({
  ticket,
  place,
  column
}: {
  ticket: SdlcTicket
  place: TicketPlace
  column: SdlcColumn
}): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stalled = ticket.status === 'blocked' || ticket.status === 'failed'

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-1">
        <span className="mr-auto text-micro text-zinc-400">
          {place === 'end' ? 'Remove from the board?' : 'Delete ticket, worktree and branch?'}
        </span>
        <button onClick={() => setConfirmDelete(false)} className={CARD_BUTTON}>
          Cancel
        </button>
        <button
          onClick={() => removeTicket(ticket, place)}
          className="rounded bg-red-600 px-1.5 py-0.5 text-micro font-medium text-white hover:bg-red-500"
        >
          {place === 'end' ? 'Remove' : 'Delete'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => setConfirmDelete(true)}
        className={cn(CARD_BUTTON, 'mr-auto hover:text-red-400')}
        aria-label={`Delete ${ticket.title}`}
        title={place === 'end' ? 'Remove from the board, keep the branch' : 'Delete the ticket, its worktree and branch'}
      >
        <Trash2 size={11} />
      </button>
      {place === 'start' && ticket.status === 'idle' && (
        <button onClick={() => void moveTicketOn(ticket.id)} className={CARD_BUTTON} title="Start the flow">
          <Play size={11} />
          Start
        </button>
      )}
      {place === 'end' && column.prompt.trim() && (
        <AccentButton
          onClick={() => void runDoneAction(ticket.id)}
          title={`Run the ${column.label} prompt for this ticket`}
        >
          <Send size={12} />
          {ticket.doneActionAt ? 'Run again' : 'Run'}
        </AccentButton>
      )}
      {place === 'agent' && stalled && (
        <button onClick={() => void rerunStage(ticket.id)} className={CARD_BUTTON} title="Run this stage again in a fresh tab">
          <RotateCcw size={11} />
          Retry
        </button>
      )}
    </div>
  )
}

function TicketCard({
  ticket,
  place,
  column
}: {
  ticket: SdlcTicket
  place: TicketPlace
  column: SdlcColumn
}): React.ReactElement {
  const hasDiff = ticket.filesChanged > 0
  const hasTab = useTerminalStore((s) => !!ticket.tabId && s.tabs.some((t) => t.id === ticket.tabId))
  const startable = place === 'start' && ticket.status === 'idle'
  return (
    <div
      tabIndex={startable ? 0 : undefined}
      onKeyDown={(e) => {
        if (startable && e.key === 'Enter' && e.target === e.currentTarget) void moveTicketOn(ticket.id)
      }}
      title={startable ? 'Press Enter to start the flow' : undefined}
      className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-left outline-none transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:border-zinc-500"
    >
      <div className="mb-1.5 line-clamp-2 text-xs font-medium leading-snug text-zinc-200">{ticket.title}</div>

      <TicketLocation ticket={ticket} />

      <TicketAttachments ticket={ticket} />

      {ticket.blockedReason && (
        <div className="mb-1.5 rounded border border-orange-900/60 bg-orange-950/30 px-1.5 py-1 text-micro leading-snug text-orange-300">
          {ticket.blockedReason}
        </div>
      )}

      {ticket.checks.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {ticket.checks.map((check) => (
            <span
              key={check.name}
              className={cn(
                'flex items-center gap-0.5 rounded px-1 py-px font-mono text-micro',
                check.passed
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'bg-red-400/10 text-red-400'
              )}
            >
              {check.passed ? <Check size={9} /> : <X size={9} />}
              {check.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={ticket.status} />
        <div className="flex items-center gap-2">
          {hasDiff && (
            <span className="font-mono text-micro tabular-nums">
              <span className="text-emerald-500">+{ticket.linesAdded}</span>{' '}
              <span className="text-red-500">-{ticket.linesRemoved}</span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <RelativeTime timestamp={ticket.updatedAt} />
        {ticket.tabId && (
          <AccentButton
            onClick={() => focusTicketTab(ticket)}
            disabled={!hasTab}
            title={hasTab ? 'Switch to the agent tab' : 'The agent tab is no longer open. Run the stage again.'}
            aria-label={`Open the agent tab for ${ticket.title}`}
          >
            <Terminal size={13} />
            Open tab
          </AccentButton>
        )}
      </div>

      <div className="mt-1.5 border-t border-zinc-800/80 pt-1.5">
        <TicketActions ticket={ticket} place={place} column={column} />
      </div>
    </div>
  )
}

function placeOf(columns: readonly SdlcColumn[], index: number): TicketPlace {
  if (index === 0) return 'start'
  return index === columns.length - 1 ? 'end' : 'agent'
}

/** The last column's prompt runs on demand, for the finished tickets that have not had it yet. */
function RunPendingButton({ column, tickets }: { column: SdlcColumn; tickets: SdlcTicket[] }): React.ReactElement {
  const pending = tickets.filter((t) => !t.doneActionAt).map((t) => t.id)
  return (
    <button
      onClick={() => void runDoneActions(pending)}
      disabled={pending.length === 0 || !column.prompt.trim()}
      className="flex items-center gap-1 rounded px-1 text-micro text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
      title={
        pending.length
          ? `Run the ${column.label} prompt for ${pending.length} ticket${pending.length === 1 ? '' : 's'} that have not had it`
          : `Every ticket here has had the ${column.label} prompt`
      }
      aria-label={`Run the ${column.label} prompt`}
    >
      <Send size={10} />
      {pending.length > 0 && pending.length}
    </button>
  )
}

/** Every column's top has the command line, blank or not, so the lanes below line up. */
function ColumnHeader({
  column,
  tickets,
  isLast
}: {
  column: SdlcColumn
  tickets: SdlcTicket[]
  isLast: boolean
}): React.ReactElement {
  const runs = hasCommand(column)
  const command = column.command.trim() || 'default agent'
  return (
    <div className="flex flex-col gap-0.5 px-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-micro font-medium uppercase tracking-wide text-zinc-400">{column.label}</span>
        <div className="flex items-center gap-1">
          {isLast && <RunPendingButton column={column} tickets={tickets} />}
          <span className="font-mono text-micro text-zinc-600">{tickets.length}</span>
        </div>
      </div>
      <span
        className={cn('truncate font-mono text-micro text-amber-400/70', !runs && 'invisible')}
        title={runs ? command : undefined}
      >
        {runs ? `$ ${command}` : '—'}
      </span>
    </div>
  )
}

function DoneTimerSelect({ projectId, columnLabel }: { projectId: string; columnLabel: string }): React.ReactElement {
  const minutes = useSdlcScheduleStore((s) => s.schedulePerProject[projectId]?.intervalMinutes ?? 0)
  const setDoneInterval = useSdlcScheduleStore((s) => s.setDoneInterval)
  return (
    <label
      className={cn('mr-2 flex items-center gap-1 rounded px-1 text-micro', minutes ? 'text-amber-400' : 'text-zinc-500')}
      title={`Run the ${columnLabel} prompt on a timer, for finished tickets that have not had it yet`}
    >
      <Timer size={12} />
      <select
        value={minutes}
        onChange={(e) => setDoneInterval(projectId, Number(e.target.value))}
        aria-label={`${columnLabel} prompt timer`}
        className="cursor-pointer bg-transparent outline-none"
      >
        {DONE_TIMER_OPTIONS.map((option) => (
          <option key={option.minutes} value={option.minutes}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProjectSwimlane({
  projectId,
  projectName,
  projectPath
}: {
  projectId: string
  projectName: string
  projectPath: string
}): React.ReactElement {
  const tickets = useSdlcStore((s) => s.tickets)
  const collapsed = useSdlcStore((s) => !!s.collapsedProjectIds[projectId])
  const toggleProjectCollapsed = useSdlcStore((s) => s.toggleProjectCollapsed)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const showSdlcPromptsPage = useProjectStore((s) => s.showSdlcPromptsPage)
  const columns = useSdlcFlowStore((s) => s.columns)
  const firstColumnId = columns[0].id

  useEffect(() => {
    void useWorktreeStore.getState().load(projectId)
  }, [projectId])

  // A ticket whose column no longer exists shows at the start rather than vanishing from the board.
  const byStage = useMemo(() => {
    const map = new Map<string, SdlcTicket[]>()
    for (const column of columns) map.set(column.id, [])
    for (const ticket of tickets) {
      if (ticket.projectId !== projectId) continue
      ;(map.get(ticket.stage) ?? map.get(firstColumnId))?.push(ticket)
    }
    return map
  }, [tickets, projectId, columns, firstColumnId])

  const totalCount = useMemo(
    () => tickets.filter((t) => t.projectId === projectId).length,
    [tickets, projectId]
  )
  const activeCount = useMemo(
    () =>
      tickets.filter(
        (t) => t.projectId === projectId && (t.status === 'running' || t.status === 'blocked')
      ).length,
    [tickets, projectId]
  )

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center transition-colors hover:bg-zinc-900/60">
      <button
        onClick={() => toggleProjectCollapsed(projectId)}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
      >
        {collapsed ? (
          <ChevronRight size={13} className="shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown size={13} className="shrink-0 text-zinc-500" />
        )}
        <FolderOpen size={13} className="shrink-0 text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-200">{projectName}</span>
        <span className="font-mono text-micro text-zinc-600">{projectPath}</span>
        <div className="ml-auto flex items-center gap-2">
          {activeCount > 0 && (
            <span className="flex items-center gap-1 rounded bg-amber-400/10 px-1.5 py-0.5 text-micro text-amber-400">
              <Loader2 size={9} className="animate-spin" />
              {activeCount} active
            </span>
          )}
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-400">
            {totalCount}
          </span>
        </div>
      </button>
      <button
        onClick={() => {
          setActiveProject(projectId)
          showSdlcPromptsPage()
        }}
        className="mr-2 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        title="Stage prompts for this project"
        aria-label={`Stage prompts for ${projectName}`}
      >
        <Settings2 size={13} />
      </button>
      <DoneTimerSelect projectId={projectId} columnLabel={columns[columns.length - 1].label} />
      </div>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <div className="flex gap-2 p-2">
            {columns.map((stage, index) => {
              const stageTickets = byStage.get(stage.id) ?? []
              return (
                <div key={stage.id} className={cn('flex flex-1 flex-col gap-1.5', LANE_MIN_WIDTH)}>
                  <ColumnHeader column={stage} tickets={stageTickets} isLast={index === columns.length - 1} />

                  <div className="flex min-h-[60px] flex-col gap-1.5 rounded-md bg-zinc-950/40 p-1.5">
                    {index === 0 && <NewTicketComposer projectId={projectId} projectName={projectName} />}
                    {stageTickets.length === 0
                      ? index !== 0 && (
                          <div className="flex flex-1 items-center justify-center py-3 text-micro text-zinc-700">
                            empty
                          </div>
                        )
                      : stageTickets.map((ticket) => (
                          <TicketCard key={ticket.id} ticket={ticket} place={placeOf(columns, index)} column={stage} />
                        ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function SdlcPage(): React.ReactElement {
  const tickets = useSdlcStore((s) => s.tickets)

  const runningCount = tickets.filter((t) => t.status === 'running').length
  const attentionCount = tickets.filter(
    (t) => t.status === 'awaiting-approval' || t.status === 'blocked' || t.status === 'failed'
  ).length
  const projects = useProjectStore((s) => s.projects)

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4">
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-zinc-400" />
          <h1 className="text-title font-semibold">Full auto agent SDLC</h1>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-400">
            {tickets.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {runningCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <Loader2 size={12} className="animate-spin" />
              {runningCount} running
            </span>
          )}
          {attentionCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-sky-400">
              <UserCheck size={12} />
              {attentionCount} need you
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-3">
          {projects.length === 0 && (
            <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
              Add a project to start a board for it.
            </div>
          )}
          {projects.map((project) => (
            <ProjectSwimlane
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              projectPath={project.path}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
