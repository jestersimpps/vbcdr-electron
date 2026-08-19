import type { StatsCommit } from '@/models/types'

export type SessionAgent = 'claude' | 'codex'

export interface AgentSession {
  id: string
  agent: SessionAgent
  projectPath: string
  title: string
  start: number
  end: number
  userTurns: number
}

export interface ActivityCommit {
  hash: string
  message: string
  timestamp: number
}

export interface ActivityProjectEntry {
  projectId: string
  projectName: string
  sessions: AgentSession[]
  commits: ActivityCommit[]
  firstMs: number
  lastMs: number
}

export interface ActivityDay {
  dayKey: string
  dayMs: number
  projects: ActivityProjectEntry[]
  sessionCount: number
  commitCount: number
}

export interface ProjectCommitsInput {
  projectId: string
  projectName: string
  projectPath: string
  commits: StatsCommit[]
}

export function dayKeyOf(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const MERGE_PREFIX = /^Merge (branch|pull request|remote-tracking)/i

export function isNoiseCommit(message: string): boolean {
  return MERGE_PREFIX.test(message.trim())
}

export function buildActivityLog(
  projectInputs: ProjectCommitsInput[],
  sessions: AgentSession[]
): ActivityDay[] {
  const pathToProject = new Map<string, { projectId: string; projectName: string }>()
  for (const p of projectInputs) {
    pathToProject.set(p.projectPath, { projectId: p.projectId, projectName: p.projectName })
  }

  const days = new Map<string, Map<string, ActivityProjectEntry>>()

  const entryFor = (
    dayKey: string,
    projectId: string,
    projectName: string
  ): ActivityProjectEntry => {
    let byProject = days.get(dayKey)
    if (!byProject) {
      byProject = new Map()
      days.set(dayKey, byProject)
    }
    let entry = byProject.get(projectId)
    if (!entry) {
      entry = {
        projectId,
        projectName,
        sessions: [],
        commits: [],
        firstMs: Number.POSITIVE_INFINITY,
        lastMs: 0
      }
      byProject.set(projectId, entry)
    }
    return entry
  }

  for (const input of projectInputs) {
    const seen = new Set<string>()
    for (const commit of input.commits) {
      const message = commit.message ?? ''
      if (isNoiseCommit(message)) continue
      const dedupeKey = `${dayKeyOf(commit.timestamp)}::${message.trim()}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      const entry = entryFor(dayKeyOf(commit.timestamp), input.projectId, input.projectName)
      entry.commits.push({
        hash: commit.hash,
        message: message.trim(),
        timestamp: commit.timestamp
      })
      entry.firstMs = Math.min(entry.firstMs, commit.timestamp)
      entry.lastMs = Math.max(entry.lastMs, commit.timestamp)
    }
  }

  for (const session of sessions) {
    const project = pathToProject.get(session.projectPath)
    if (!project) continue
    const entry = entryFor(dayKeyOf(session.end), project.projectId, project.projectName)
    entry.sessions.push(session)
    entry.firstMs = Math.min(entry.firstMs, session.start)
    entry.lastMs = Math.max(entry.lastMs, session.end)
  }

  const out: ActivityDay[] = []
  days.forEach((byProject, dayKey) => {
    const projects: ActivityProjectEntry[] = []
    byProject.forEach((entry) => projects.push(entry))
    for (const entry of projects) {
      entry.commits.sort((a, b) => b.timestamp - a.timestamp)
      entry.sessions.sort((a, b) => b.end - a.end)
      if (entry.firstMs === Number.POSITIVE_INFINITY) entry.firstMs = entry.lastMs
    }
    projects.sort((a, b) => b.lastMs - a.lastMs)
    out.push({
      dayKey,
      dayMs: startOfDayMs(projects[0]?.lastMs ?? Date.parse(dayKey)),
      projects,
      sessionCount: projects.reduce((n, p) => n + p.sessions.length, 0),
      commitCount: projects.reduce((n, p) => n + p.commits.length, 0)
    })
  })

  return out.sort((a, b) => b.dayMs - a.dayMs)
}

export function formatDayLabel(dayMs: number, now: number = Date.now()): string {
  const today = startOfDayMs(now)
  const day = startOfDayMs(dayMs)
  const diffDays = Math.round((today - day) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  const d = new Date(dayMs)
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === new Date(now).getFullYear()
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
  return d.toLocaleDateString(undefined, opts)
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function activityLogToMarkdown(days: ActivityDay[], now: number = Date.now()): string {
  const lines: string[] = ['# Activity log', '']

  if (days.length === 0) {
    lines.push('_No activity recorded._')
    return lines.join('\n')
  }

  for (const day of days) {
    const counts: string[] = []
    if (day.sessionCount > 0) {
      counts.push(`${day.sessionCount} session${day.sessionCount === 1 ? '' : 's'}`)
    }
    if (day.commitCount > 0) {
      counts.push(`${day.commitCount} commit${day.commitCount === 1 ? '' : 's'}`)
    }

    lines.push(`## ${formatDayLabel(day.dayMs, now)} (${day.dayKey})`)
    if (counts.length > 0) lines.push(`_${counts.join(' · ')}_`)
    lines.push('')

    for (const entry of day.projects) {
      lines.push(`### ${entry.projectName}`)
      for (const s of entry.sessions) {
        lines.push(`- ${s.agent === 'claude' ? 'Claude' : 'Codex'}: ${s.title}`)
      }
      for (const c of entry.commits) {
        lines.push(`- \`${c.hash.slice(0, 7)}\` ${c.message}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}
