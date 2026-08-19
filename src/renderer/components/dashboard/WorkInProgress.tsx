import { useEffect, useMemo, useState } from 'react'
import { GitBranch as GitBranchIcon, FileDiff, ArrowUp, ArrowDown, TriangleAlert, Bot } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { useTerminalStore } from '@/stores/terminal-store'
import {
  toWipProject,
  rankWipProjects,
  hasOpenWork,
  summarizeChangedAreas,
  type WipLlmStatus
} from '@/lib/work-in-progress'
import type { AgentSession } from '@/lib/activity-log'
import { cn } from '@/lib/utils'

interface WorkInProgressProps {
  onOpenProject: (projectId: string) => void
}

export function WorkInProgress({ onOpenProject }: WorkInProgressProps): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const statusPerProject = useGitStore((s) => s.statusPerProject)
  const driftPerProject = useGitStore((s) => s.driftPerProject)
  const branchesPerProject = useGitStore((s) => s.branchesPerProject)
  const loadStatus = useGitStore((s) => s.loadStatus)
  const tabs = useTerminalStore((s) => s.tabs)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const [latestTitle, setLatestTitle] = useState<Record<string, string>>({})

  useEffect(() => {
    for (const project of projects) {
      void loadStatus(project.id, project.path)
    }
  }, [projects, loadStatus])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const sessions = (await window.api.sessionSummary
        .list(projects.map((p) => p.path), sinceIso)
        .catch(() => [])) as AgentSession[]
      if (cancelled) return

      const byPath: Record<string, AgentSession> = {}
      for (const s of sessions) {
        const current = byPath[s.projectPath]
        if (!current || s.end > current.end) byPath[s.projectPath] = s
      }
      const map: Record<string, string> = {}
      for (const p of projects) {
        const s = byPath[p.path]
        if (s) map[p.id] = s.title
      }
      setLatestTitle(map)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projects])

  const pathById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of projects) map[p.id] = p.path
    return map
  }, [projects])

  const ranked = useMemo(() => {
    const rows = projects.map((project) => {
      const llmTabs = tabs.filter((t) => t.projectId === project.id && t.initialCommand)
      let llmStatus: WipLlmStatus = 'none'
      if (llmTabs.length > 0) {
        llmStatus = llmTabs.some((t) => tabStatuses[t.id] === 'busy') ? 'busy' : 'idle'
      }
      return toWipProject({
        projectId: project.id,
        projectName: project.name,
        branch: branchesPerProject[project.id]?.find((b) => b.current)?.name ?? null,
        llmStatus,
        llmSessionCount: llmTabs.length,
        status: statusPerProject[project.id],
        drift: driftPerProject[project.id],
        lastActivityMs: project.lastOpened
      })
    })
    return rankWipProjects(rows).filter(hasOpenWork)
  }, [projects, tabs, tabStatuses, statusPerProject, driftPerProject, branchesPerProject])

  if (ranked.length === 0) {
    return (
      <div className="flex flex-col gap-1 px-3 py-6 text-center">
        <p className="text-xs text-zinc-600">Nothing in progress</p>
        <p className="text-micro text-zinc-700">All projects are clean with no open sessions</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {ranked.map((p) => (
        <button
          key={p.projectId}
          onClick={() => onOpenProject(p.projectId)}
          className="group flex flex-col gap-1 border-b border-zinc-800/60 px-3 py-2 text-left transition-colors hover:bg-zinc-800/30"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-block h-2 w-2 shrink-0 rounded-full',
                p.llmStatus === 'busy' && 'animate-pulse bg-amber-400',
                p.llmStatus === 'idle' && 'bg-emerald-400',
                p.llmStatus === 'none' && 'bg-zinc-600'
              )}
            />
            <span className="truncate text-body font-medium text-zinc-200">{p.projectName}</span>
            {p.branch && (
              <>
                <GitBranchIcon size={10} className="ml-auto shrink-0 text-zinc-600" />
                <span className="max-w-[45%] truncate font-mono text-micro text-zinc-500">
                  {p.branch}
                </span>
              </>
            )}
          </div>

          {latestTitle[p.projectId] && (
            <div className="flex items-start gap-1.5 pl-3.5">
              <Bot size={11} className="mt-[2px] shrink-0 text-violet-400/70" />
              <span className="line-clamp-2 text-body leading-snug text-zinc-300">
                {latestTitle[p.projectId]}
              </span>
            </div>
          )}

          {(() => {
            const areas = summarizeChangedAreas(
              statusPerProject[p.projectId],
              pathById[p.projectId] ?? ''
            )
            if (areas.length === 0) return null
            return (
              <div className="truncate pl-3.5 font-mono text-meta text-zinc-600">
                {areas.join(' · ')}
              </div>
            )
          })()}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-3.5 text-meta tabular-nums">
            {p.conflicts > 0 && (
              <span className="flex items-center gap-1 text-rose-400">
                <TriangleAlert size={9} />
                {p.conflicts} conflict{p.conflicts === 1 ? '' : 's'}
              </span>
            )}
            {p.changedFiles > 0 ? (
              <span className="flex items-center gap-1 text-zinc-400">
                <FileDiff size={9} />
                {p.changedFiles} changed
              </span>
            ) : (
              <span className="text-zinc-600">clean</span>
            )}
            {p.ahead > 0 && (
              <span className="flex items-center gap-0.5 text-sky-400/80">
                <ArrowUp size={9} />
                {p.ahead}
              </span>
            )}
            {p.behind > 0 && (
              <span className="flex items-center gap-0.5 text-amber-400/80">
                <ArrowDown size={9} />
                {p.behind}
              </span>
            )}
            {p.llmSessionCount > 0 && (
              <span className="text-zinc-500">
                {p.llmSessionCount} session{p.llmSessionCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
