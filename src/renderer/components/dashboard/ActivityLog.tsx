import { useEffect, useMemo, useState } from 'react'
import { GitCommit, Bot, Loader2 } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import {
  buildActivityLog,
  activityLogToMarkdown,
  formatDayLabel,
  formatClock,
  type AgentSession,
  type ProjectCommitsInput
} from '@/lib/activity-log'
import type { StatsCommit } from '@/models/types'
import { cn } from '@/lib/utils'

const LOG_DAYS = 30

interface ArchivedProjectInfo {
  id: string
  name: string
  path: string
  archivedAt: number
}

interface ActivityLogProps {
  onExportReady?: (exportFn: (() => Promise<void>) | null, hasData: boolean) => void
}

export function ActivityLog({ onExportReady }: ActivityLogProps): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const [commitsByProject, setCommitsByProject] = useState<ProjectCommitsInput[]>([])
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      setLoading(true)
      const sinceIso = new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString()

      const archived = (await window.api.projects
        .listArchived()
        .catch(() => [])) as ArchivedProjectInfo[]
      const activeIds = new Set(projects.map((p) => p.id))
      const all = [
        ...projects.map((p) => ({ id: p.id, name: p.name, path: p.path })),
        ...archived
          .filter((a) => !activeIds.has(a.id))
          .map((a) => ({ id: a.id, name: `${a.name} (archived)`, path: a.path }))
      ]

      const [commitRows, sessionRows] = await Promise.all([
        Promise.all(
          all.map(async (p): Promise<ProjectCommitsInput | null> => {
            try {
              if (!(await window.api.git.isRepo(p.path))) return null
              const [commits, userEmail] = await Promise.all([
                window.api.git.commitsSince(p.path, sinceIso) as Promise<StatsCommit[]>,
                window.api.git.userEmail(p.path) as Promise<string>
              ])
              return {
                projectId: p.id,
                projectName: p.name,
                projectPath: p.path,
                commits: userEmail
                  ? commits.filter((c) => c.authorEmail === userEmail)
                  : commits
              }
            } catch {
              return null
            }
          })
        ),
        window.api.sessionSummary
          .list(all.map((p) => p.path), sinceIso)
          .catch(() => []) as Promise<AgentSession[]>
      ])

      if (cancelled) return
      setCommitsByProject(commitRows.filter((r): r is ProjectCommitsInput => r !== null))
      setSessions(sessionRows)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projects])

  const days = useMemo(
    () => buildActivityLog(commitsByProject, sessions),
    [commitsByProject, sessions]
  )

  const exportLog = async (): Promise<void> => {
    const markdown = activityLogToMarkdown(days)
    const stamp = new Date().toISOString().slice(0, 10)
    await window.api.fs.saveText(`activity-log-${stamp}.md`, markdown)
  }

  useEffect(() => {
    onExportReady?.(exportLog, days.length > 0)
  }, [days, onExportReady])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-600">
        <Loader2 size={12} className="animate-spin" />
        Reading history
      </div>
    )
  }

  if (days.length === 0) {
    return (
      <div className="flex flex-col gap-1 px-3 py-8 text-center">
        <p className="text-xs text-zinc-600">No activity yet</p>
        <p className="text-micro text-zinc-700">
          Commits and agent sessions from the last {LOG_DAYS} days show up here
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <div key={day.dayKey}>
          <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 py-1.5 backdrop-blur">
            <span className="text-sm font-medium text-zinc-200">
              {formatDayLabel(day.dayMs)}
            </span>
            <span className="text-meta tabular-nums text-zinc-600">
              {day.sessionCount > 0 && `${day.sessionCount} session${day.sessionCount === 1 ? '' : 's'}`}
              {day.sessionCount > 0 && day.commitCount > 0 && ' · '}
              {day.commitCount > 0 && `${day.commitCount} commit${day.commitCount === 1 ? '' : 's'}`}
            </span>
          </div>

          {day.projects.map((entry) => (
            <div key={entry.projectId} className="border-b border-zinc-800/40 px-3 py-2">
              <button
                onClick={() => setActiveProject(entry.projectId)}
                className="mb-1 flex w-full items-baseline gap-2 text-left"
              >
                <span className="truncate text-body font-medium text-zinc-400 hover:text-zinc-200">
                  {entry.projectName}
                </span>
                <span className="ml-auto shrink-0 font-mono text-meta tabular-nums text-zinc-700">
                  {formatClock(entry.lastMs)}
                </span>
              </button>

              <div className="flex flex-col gap-1">
                {entry.sessions.map((s) => (
                  <div key={s.id} className="flex items-start gap-1.5">
                    <Bot
                      size={11}
                      className={cn(
                        'mt-[3px] shrink-0',
                        s.agent === 'claude' ? 'text-violet-400/70' : 'text-teal-400/70'
                      )}
                    />
                    <span className="text-body leading-snug text-zinc-200">{s.title}</span>
                  </div>
                ))}
                {entry.commits.map((c) => (
                  <div key={c.hash} className="flex items-start gap-1.5">
                    <GitCommit size={11} className="mt-[3px] shrink-0 text-zinc-600" />
                    <span className="text-body leading-snug text-zinc-500">{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
