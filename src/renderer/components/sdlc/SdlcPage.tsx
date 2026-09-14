import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader2,
  Paperclip,
  Plus,
  UserCheck,
  Workflow,
  X
} from 'lucide-react'
import {
  MODEL_PROVIDERS,
  SDLC_STAGES,
  type ModelProviderId,
  type SdlcStage,
  type SdlcTicket,
  type SdlcTicketStatus
} from '@/models/sdlc'
import { useProviderModels, type UseProviderModels } from '@/hooks/useProviderModels'
import { SDLC_MOCK_PROJECTS } from '@/config/sdlc-mock-data'
import { useSdlcStore } from '@/stores/sdlc-store'
import { NewTicketModal } from '@/components/sdlc/NewTicketModal'
import { TicketDetailModal } from '@/components/sdlc/TicketDetailModal'
import { cn } from '@/lib/utils'

const LANE_MIN_WIDTH = 'min-w-[220px]'

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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

function TicketCard({
  ticket,
  isSelected,
  onSelect
}: {
  ticket: SdlcTicket
  isSelected: boolean
  onSelect: () => void
}): React.ReactElement {
  const hasDiff = ticket.filesChanged > 0
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border bg-zinc-900/60 p-2 text-left transition-colors',
        isSelected
          ? 'border-indigo-500/70 bg-zinc-900'
          : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium leading-snug text-zinc-200">
          {ticket.title}
        </span>
        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-px font-mono text-micro text-zinc-400">
          {ticket.agent}
        </span>
      </div>

      {ticket.branch !== '—' && (
        <div className="mb-1.5 flex items-center gap-1 text-micro text-zinc-500">
          <GitBranch size={10} className="shrink-0" />
          <span className="truncate font-mono">{ticket.branch}</span>
        </div>
      )}

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
          {ticket.attachments.length > 0 && (
            <span className="flex items-center gap-0.5 text-micro text-zinc-600">
              <Paperclip size={9} />
              {ticket.attachments.length}
            </span>
          )}
          {hasDiff && (
            <span className="font-mono text-micro tabular-nums">
              <span className="text-emerald-500">+{ticket.linesAdded}</span>{' '}
              <span className="text-red-500">-{ticket.linesRemoved}</span>
            </span>
          )}
          {ticket.prUrl && <ExternalLink size={10} className="text-zinc-600" />}
        </div>
      </div>

      <div className="mt-1 text-micro text-zinc-600">{relativeTime(ticket.updatedAt)}</div>
    </button>
  )
}

const SELECT_CLASS =
  'w-full truncate rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-micro text-zinc-400 outline-none hover:border-zinc-700 focus:border-zinc-600 disabled:opacity-40'

function StageModelPicker({
  stage,
  label,
  models
}: {
  stage: SdlcStage
  label: string
  models: UseProviderModels
}): React.ReactElement {
  const assignment = useSdlcStore((s) => s.stageModels[stage])
  const setStageProvider = useSdlcStore((s) => s.setStageProvider)
  const setStageModel = useSdlcStore((s) => s.setStageModel)

  const provider = assignment?.provider
  const result = provider ? models.byProvider[provider] : undefined
  const error = result?.error ?? null

  return (
    <div className={cn('flex flex-1 flex-col gap-1', LANE_MIN_WIDTH)}>
      <span className="truncate px-0.5 text-micro font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <select
        value={provider ?? ''}
        aria-label={`Provider for ${stage}`}
        onChange={(e) => setStageProvider(stage, e.target.value as ModelProviderId)}
        className={SELECT_CLASS}
      >
        <option value="" disabled>
          —
        </option>
        {MODEL_PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        value={assignment?.model ?? ''}
        disabled={!provider || models.isLoading || !!error || !result?.models.length}
        aria-label={`Model for ${stage}`}
        onChange={(e) => setStageModel(stage, e.target.value || null)}
        className={SELECT_CLASS}
        title={error ?? undefined}
      >
        <option value="" disabled>
          {!provider
            ? '—'
            : models.isLoading
              ? 'loading…'
              : error
                ? error
                : result?.models.length
                  ? 'pick a model'
                  : 'no models'}
        </option>
        {result?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Every stage takes a slot so this row lines up with the swimlane columns below,
 * but only the agent-driven ones get a picker: backlog has no worktree yet, and
 * review and done are human steps — nothing runs there to pick a model for.
 *
 * The padding mirrors the swimlane's own `p-4` page gutter plus its inner `p-2`,
 * so the slots sit over the columns rather than drifting by the difference.
 */
function StageModelBar(): React.ReactElement {
  const models = useProviderModels()

  return (
    <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/30 px-4 pb-2 pt-2">
      <div className="flex items-start gap-2 px-2">
        {SDLC_STAGES.map((stage) =>
          stage.autonomous ? (
            <StageModelPicker
              key={stage.id}
              stage={stage.id}
              label={stage.label}
              models={models}
            />
          ) : (
            <div key={stage.id} className={cn('flex-1', LANE_MIN_WIDTH)} aria-hidden />
          )
        )}
      </div>
    </div>
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
  const [modalOpen, setModalOpen] = useState(false)
  const tickets = useSdlcStore((s) => s.tickets)
  const collapsed = useSdlcStore((s) => !!s.collapsedProjectIds[projectId])
  const toggleProjectCollapsed = useSdlcStore((s) => s.toggleProjectCollapsed)
  const selectedTicketId = useSdlcStore((s) => s.selectedTicketId)
  const selectTicket = useSdlcStore((s) => s.selectTicket)

  const byStage = useMemo(() => {
    const map = new Map<SdlcStage, SdlcTicket[]>()
    for (const stage of SDLC_STAGES) map.set(stage.id, [])
    for (const ticket of tickets) {
      if (ticket.projectId !== projectId) continue
      map.get(ticket.stage)?.push(ticket)
    }
    return map
  }, [tickets, projectId])

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
      <button
        onClick={() => toggleProjectCollapsed(projectId)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-900/60"
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

      {!collapsed && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <div className="flex gap-2 p-2">
            {SDLC_STAGES.map((stage) => {
              const stageTickets = byStage.get(stage.id) ?? []
              return (
                <div
                  key={stage.id}
                  className={cn('flex flex-1 flex-col gap-1.5', LANE_MIN_WIDTH)}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-micro font-medium uppercase tracking-wide text-zinc-400">
                        {stage.label}
                      </span>
                      {stage.autonomous && (
                        <span
                          className="h-1 w-1 shrink-0 rounded-full bg-amber-400/70"
                          title="Agent-driven stage"
                        />
                      )}
                    </div>
                    <span className="font-mono text-micro text-zinc-600">
                      {stageTickets.length}
                    </span>
                  </div>

                  <div className="flex min-h-[60px] flex-col gap-1.5 rounded-md bg-zinc-950/40 p-1.5">
                    {stage.id === 'backlog' && (
                      <button
                        onClick={() => setModalOpen(true)}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-800 py-2 text-micro text-zinc-500 transition-colors hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300"
                        title={`New ticket in ${projectName}`}
                      >
                        <Plus size={11} />
                        New ticket
                      </button>
                    )}
                    {stageTickets.length === 0
                      ? stage.id !== 'backlog' && (
                          <div className="flex flex-1 items-center justify-center py-3 text-micro text-zinc-700">
                            empty
                          </div>
                        )
                      : stageTickets.map((ticket) => (
                          <TicketCard
                            key={ticket.id}
                            ticket={ticket}
                            isSelected={selectedTicketId === ticket.id}
                            onSelect={() => selectTicket(ticket.id)}
                          />
                        ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <NewTicketModal
        isOpen={modalOpen}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}

export function SdlcPage(): React.ReactElement {
  const tickets = useSdlcStore((s) => s.tickets)
  const selectedTicketId = useSdlcStore((s) => s.selectedTicketId)
  const selectTicket = useSdlcStore((s) => s.selectTicket)
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId)

  const runningCount = tickets.filter((t) => t.status === 'running').length
  const attentionCount = tickets.filter(
    (t) => t.status === 'awaiting-approval' || t.status === 'blocked' || t.status === 'failed'
  ).length

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4">
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-zinc-400" />
          <h1 className="text-title font-semibold">Agent SDLC</h1>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-400">
            {tickets.length}
          </span>
          <span className="rounded border border-amber-900/60 bg-amber-950/30 px-1.5 py-0.5 text-micro text-amber-400">
            mock data
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

      <StageModelBar />

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-3">
          {SDLC_MOCK_PROJECTS.map((project) => (
            <ProjectSwimlane
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              projectPath={project.path}
            />
          ))}
        </div>
      </div>

      <TicketDetailModal ticket={selectedTicket} onClose={() => selectTicket(null)} />
    </div>
  )
}
