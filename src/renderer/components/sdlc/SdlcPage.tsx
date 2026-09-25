import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
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
import type { Project } from '@/models/types'
import { hasCommand, type SdlcColumn, type SdlcFlow } from '@/models/sdlc-flow'
import { useProjectStore } from '@/stores/project-store'
import { summaryFromDescription, useSdlcStore } from '@/stores/sdlc-store'
import { ticketFlow, useSdlcFlowStore } from '@/stores/sdlc-flow-store'
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

const LANE_MIN_WIDTH = 'min-w-[240px]'

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

/** Which project a card belongs to, now that one board holds them all. */
function ProjectBadge({ project, projectId }: { project: Project | undefined; projectId: string }): React.ReactElement {
  return (
    <span
      className="flex min-w-0 items-center gap-1 rounded bg-zinc-800/80 px-1.5 py-0.5 text-micro text-zinc-400"
      title={project ? project.path : `Project ${projectId} is no longer open`}
    >
      <FolderOpen size={10} className="shrink-0 text-zinc-500" />
      <span className="truncate">{project?.name ?? 'unknown project'}</span>
    </span>
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
  column,
  project
}: {
  ticket: SdlcTicket
  place: TicketPlace
  column: SdlcColumn
  project: Project | undefined
}): React.ReactElement {
  const hasDiff = ticket.filesChanged > 0
  const hasTab = useTerminalStore((s) => !!ticket.tabId && s.tabs.some((t) => t.id === ticket.tabId))
  const startable = place === 'start' && ticket.status === 'idle'
  const summary = summaryFromDescription(ticket.description)
  return (
    <div
      tabIndex={startable ? 0 : undefined}
      onKeyDown={(e) => {
        if (startable && e.key === 'Enter' && e.target === e.currentTarget) void moveTicketOn(ticket.id)
      }}
      title={startable ? 'Press Enter to start the flow' : undefined}
      className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-left outline-none transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:border-zinc-500"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <ProjectBadge project={project} projectId={ticket.projectId} />
        <StatusBadge status={ticket.status} />
      </div>

      <div className="line-clamp-2 text-xs font-medium leading-snug text-zinc-200" title={ticket.title}>
        {ticket.title}
      </div>

      {summary && (
        <div className="mt-1 line-clamp-3 text-micro leading-relaxed text-zinc-500" title={ticket.description}>
          {summary}
        </div>
      )}

      <div className="mt-1.5">
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
                  check.passed ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                )}
              >
                {check.passed ? <Check size={9} /> : <X size={9} />}
                {check.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <RelativeTime timestamp={ticket.updatedAt} />
          {hasDiff && (
            <span className="font-mono text-micro tabular-nums">
              <span className="text-emerald-500">+{ticket.linesAdded}</span>{' '}
              <span className="text-red-500">-{ticket.linesRemoved}</span>
            </span>
          )}
        </div>
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
    <div className="sticky top-0 z-10 flex flex-col gap-0.5 border-b border-zinc-800/80 bg-zinc-950 px-0.5 pb-1.5">
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

/** One timer for the board: it runs the last column's prompt for every project's finished tickets. */
function DoneTimerSelect({ columnLabel }: { columnLabel: string }): React.ReactElement {
  const minutes = useSdlcScheduleStore((s) => s.schedule?.intervalMinutes ?? 0)
  const setDoneInterval = useSdlcScheduleStore((s) => s.setDoneInterval)
  return (
    <label
      className={cn('flex items-center gap-1 rounded px-1 text-xs', minutes ? 'text-amber-400' : 'text-zinc-500')}
      title={`Run the ${columnLabel} prompt on a timer, for finished tickets that have not had it yet`}
    >
      <Timer size={13} />
      <select
        value={minutes}
        onChange={(e) => setDoneInterval(Number(e.target.value))}
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

/**
 * Every flow's columns are on the board at all times, so a ticket always has
 * the lane its own flow says it is in, whatever flow the other tickets run.
 */
function FlowLanes({
  flow,
  byStage,
  projectsById
}: {
  flow: SdlcFlow
  byStage: Map<string, SdlcTicket[]>
  projectsById: Map<string, Project>
}): React.ReactElement {
  const last = flow.columns.length - 1
  const count = flow.columns.reduce((n, c) => n + (byStage.get(laneId(flow.id, c.id))?.length ?? 0), 0)
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-20 flex items-center gap-2 bg-zinc-950 pb-1">
        <Workflow size={11} className="shrink-0 text-zinc-600" />
        <span className="truncate text-micro font-semibold uppercase tracking-wide text-zinc-500">{flow.name}</span>
        <span className="font-mono text-micro text-zinc-700">{count}</span>
        <div className="h-px flex-1 bg-zinc-800/80" />
      </div>
      <div className="flex flex-1 gap-2">
        {flow.columns.map((column, index) => {
          const laneTickets = byStage.get(laneId(flow.id, column.id)) ?? []
          return (
            <div key={column.id} className={cn('flex flex-1 flex-col gap-1.5', LANE_MIN_WIDTH)}>
              <ColumnHeader column={column} tickets={laneTickets} isLast={index === last} />

              <div className="flex min-h-[60px] flex-1 flex-col gap-1.5 rounded-md bg-zinc-900/20 p-1.5">
                {laneTickets.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center py-3 text-micro text-zinc-700">empty</div>
                ) : (
                  laneTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      place={placeOf(flow.columns, index)}
                      column={column}
                      project={projectsById.get(ticket.projectId)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Column ids repeat across flows, so a lane is a flow and a column together. */
function laneId(flowId: string, columnId: string): string {
  return `${flowId}\u0000${columnId}`
}

export function SdlcPage(): React.ReactElement {
  const tickets = useSdlcStore((s) => s.tickets)
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const showSdlcPromptsPage = useProjectStore((s) => s.showSdlcPromptsPage)
  const flows = useSdlcFlowStore((s) => s.flows)
  const flowPerProject = useSdlcFlowStore((s) => s.flowPerProject)
  const lastColumn = flows[0].columns[flows[0].columns.length - 1]

  const runningCount = tickets.filter((t) => t.status === 'running').length
  const attentionCount = tickets.filter(
    (t) => t.status === 'awaiting-approval' || t.status === 'blocked' || t.status === 'failed'
  ).length

  // Cards read their worktree from the tracked list, and every project on the
  // board can have one, so all of them are loaded rather than the active one.
  const projectIds = projects.map((p) => p.id).join('\u0000')
  useEffect(() => {
    for (const id of projectIds.split('\u0000').filter(Boolean)) void useWorktreeStore.getState().load(id)
  }, [projectIds])

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  // Keyed by flow and column, and a ticket whose column no longer exists shows
  // at the start of its flow rather than vanishing from the board.
  const byStage = useMemo(() => {
    const map = new Map<string, SdlcTicket[]>()
    for (const flow of flows) for (const column of flow.columns) map.set(laneId(flow.id, column.id), [])
    for (const ticket of tickets) {
      const flow = ticketFlow({ flows, flowPerProject }, ticket)
      const lane = map.get(laneId(flow.id, ticket.stage)) ?? map.get(laneId(flow.id, flow.columns[0].id))
      lane?.push(ticket)
    }
    return map
  }, [tickets, flows, flowPerProject])

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow size={16} className="shrink-0 text-zinc-400" />
          <h1 className="truncate text-title font-semibold">Full auto agent SDLC</h1>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-400">{tickets.length}</span>
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
          <DoneTimerSelect columnLabel={lastColumn.label} />
          <button
            onClick={showSdlcPromptsPage}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="Stage prompts per project"
            aria-label="Stage prompts"
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-3">
        {projects.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
            Add a project to start shooting in tickets.
          </div>
        ) : (
          <NewTicketComposer projects={projects} defaultProjectId={activeProjectId} />
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4 pt-3">
        <div className="flex min-h-full min-w-max gap-6">
          {flows.map((flow) => (
            <FlowLanes key={flow.id} flow={flow} byStage={byStage} projectsById={projectsById} />
          ))}
        </div>
      </div>
    </div>
  )
}
