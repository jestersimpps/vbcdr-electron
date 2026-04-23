import type { StatsCommit } from '@/models/types'

export type SessionSource = 'commits' | 'terminal' | 'both'

export interface ActivitySessionInput {
  projectId: string
  start: number
  end: number
  durationMs: number
  inputCount: number
  outputCount: number
}

export interface Session {
  projectId: string
  projectName: string
  start: number
  end: number
  durationMs: number
  commitCount: number
}

export interface ProjectCommits {
  projectId: string
  projectName: string
  commits: StatsCommit[]
}

export interface TimeRange {
  key: 'today' | 'week' | 'month' | 'ytd' | 'all'
  label: string
}

export const TIME_RANGES: TimeRange[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All time' }
]

export function rangeStartMs(key: TimeRange['key'], now: Date = new Date()): number | null {
  if (key === 'all') return null
  const d = new Date(now)
  if (key === 'today') {
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (key === 'week') {
    const day = d.getDay()
    const diff = (day + 6) % 7
    d.setDate(d.getDate() - diff)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (key === 'month') {
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (key === 'ytd') {
    d.setMonth(0, 1)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  return null
}

export function buildSessions(
  input: ProjectCommits[],
  gapMinutes: number,
  leadInMinutes: number
): Session[] {
  const gapMs = gapMinutes * 60_000
  const leadInMs = leadInMinutes * 60_000
  const sessions: Session[] = []

  for (const { projectId, projectName, commits } of input) {
    if (commits.length === 0) continue
    const sorted = [...commits].sort((a, b) => a.timestamp - b.timestamp)
    let sessionStart = sorted[0].timestamp
    let sessionEnd = sorted[0].timestamp
    let count = 1

    const flush = (): void => {
      sessions.push({
        projectId,
        projectName,
        start: sessionStart - leadInMs,
        end: sessionEnd,
        durationMs: sessionEnd - sessionStart + leadInMs,
        commitCount: count
      })
    }

    for (let i = 1; i < sorted.length; i++) {
      const t = sorted[i].timestamp
      if (t - sessionEnd <= gapMs) {
        sessionEnd = t
        count++
      } else {
        flush()
        sessionStart = t
        sessionEnd = t
        count = 1
      }
    }
    flush()
  }

  return sessions
}

export function activityToSessions(
  activity: ActivitySessionInput[],
  projectNameById: Record<string, string>
): Session[] {
  return activity
    .filter((a) => projectNameById[a.projectId])
    .map((a) => ({
      projectId: a.projectId,
      projectName: projectNameById[a.projectId],
      start: a.start,
      end: a.end,
      durationMs: a.durationMs,
      commitCount: 0
    }))
}

export function mergeSessions(sessions: Session[]): Session[] {
  const byProject: Record<string, Session[]> = {}
  for (const s of sessions) {
    if (!byProject[s.projectId]) byProject[s.projectId] = []
    byProject[s.projectId].push(s)
  }
  const merged: Session[] = []
  for (const projectId of Object.keys(byProject)) {
    const arr = byProject[projectId]
    arr.sort((a: Session, b: Session) => a.start - b.start)
    let current: Session | null = null
    for (const s of arr) {
      if (!current) {
        current = { ...s }
        continue
      }
      if (s.start <= current.end) {
        current.end = Math.max(current.end, s.end)
        current.durationMs = current.end - current.start
        current.commitCount += s.commitCount
      } else {
        merged.push(current)
        current = { ...s }
      }
    }
    if (current) merged.push(current)
  }
  return merged
}

export function clipSessionsToRange(sessions: Session[], startMs: number | null): Session[] {
  if (startMs === null) return sessions
  const out: Session[] = []
  for (const s of sessions) {
    if (s.end < startMs) continue
    if (s.start >= startMs) {
      out.push(s)
      continue
    }
    out.push({ ...s, start: startMs, durationMs: s.end - startMs })
  }
  return out
}

export function formatHours(ms: number): string {
  const hours = ms / 3_600_000
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 10) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
