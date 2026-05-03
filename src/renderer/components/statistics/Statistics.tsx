import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart,
  Bar,
  PieChart as RPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { Clock, CalendarDays, Folder, Timer, SlidersHorizontal, Flame, Trophy, CalendarCheck } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useStatsStore } from '@/stores/stats-store'
import { useThemeStore } from '@/stores/theme-store'
import { getChartPalette } from '@/config/chart-palette'
import {
  TIME_RANGES,
  rangeStartMs,
  buildSessions,
  clipSessionsToRange,
  activityToSessions,
  mergeSessions,
  formatHours,
  formatDuration,
  type ProjectCommits,
  type Session,
  type ActivitySessionInput,
  type SessionSource,
  type TimeRange
} from '@/lib/sessions'
import type { StatsCommit, LanguageTally } from '@/models/types'
import { cn } from '@/lib/utils'

const SOURCE_OPTIONS: { key: SessionSource; label: string }[] = [
  { key: 'commits', label: 'Commits' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'both', label: 'Both' }
]

type HistoryWindow = 'today' | 'week' | 'month' | 'year' | 'custom'
type HistoryMetric = 'hours' | 'commits'
type HistoryView = 'heatmap' | 'timeline'

const HISTORY_WINDOWS: { key: HistoryWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' }
]

function parseDateInput(value: string): number | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d, 0, 0, 0, 0)
  if (isNaN(date.getTime())) return null
  return date.getTime()
}

function formatDateInput(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface HistoryRange {
  start: number
  end: number
  windowEnd: number
}

function historyRange(w: HistoryWindow, customFromMs: number | null, customToMs: number | null): HistoryRange {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const endOfToday = today.getTime() + 86_400_000 - 1
  if (w === 'custom') {
    const start = customFromMs ?? today.getTime()
    const endDay = customToMs ?? today.getTime()
    const end = Math.min(endDay + 86_400_000 - 1, Date.now())
    return { start: Math.min(start, end), end, windowEnd: endDay + 86_400_000 - 1 }
  }
  if (w === 'today') return { start: today.getTime(), end: endOfToday, windowEnd: endOfToday }
  if (w === 'week') {
    const d = new Date(today)
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    const weekEnd = new Date(d)
    weekEnd.setDate(weekEnd.getDate() + 7)
    return { start: d.getTime(), end: endOfToday, windowEnd: weekEnd.getTime() - 1 }
  }
  if (w === 'month') {
    const d = new Date(today)
    d.setDate(1)
    const monthEnd = new Date(d)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    return { start: d.getTime(), end: endOfToday, windowEnd: monthEnd.getTime() - 1 }
  }
  const d = new Date(today)
  d.setMonth(0, 1)
  const yearEnd = new Date(d)
  yearEnd.setFullYear(yearEnd.getFullYear() + 1)
  return { start: d.getTime(), end: endOfToday, windowEnd: yearEnd.getTime() - 1 }
}

interface ProjectData {
  projectId: string
  projectName: string
  commits: StatsCommit[]
  languages: LanguageTally
  userEmail: string
}

interface ArchivedProjectInfo {
  id: string
  name: string
  path: string
  archivedAt: number
}

interface StatsProject {
  id: string
  name: string
  path: string
  archived: boolean
}

export function Statistics(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const range = useStatsStore((s) => s.range)
  const gapMinutes = useStatsStore((s) => s.gapMinutes)
  const leadInMinutes = useStatsStore((s) => s.leadInMinutes)
  const includeAllAuthors = useStatsStore((s) => s.includeAllAuthors)
  const source = useStatsStore((s) => s.source)
  const idleMinutes = useStatsStore((s) => s.idleMinutes)
  const setRange = useStatsStore((s) => s.setRange)
  const setGapMinutes = useStatsStore((s) => s.setGapMinutes)
  const setLeadInMinutes = useStatsStore((s) => s.setLeadInMinutes)
  const setIncludeAllAuthors = useStatsStore((s) => s.setIncludeAllAuthors)
  const setSource = useStatsStore((s) => s.setSource)
  const setIdleMinutes = useStatsStore((s) => s.setIdleMinutes)
  const themeId = useThemeStore((s) => s.getFullThemeId())
  const palette = useMemo(() => getChartPalette(themeId), [themeId])

  const [data, setData] = useState<ProjectData[]>([])
  const [activity, setActivity] = useState<ActivitySessionInput[]>([])
  const [loading, setLoading] = useState(false)
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProjectInfo[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const rows = (await window.api.projects.listArchived()) as ArchivedProjectInfo[]
      if (!cancelled) setArchivedProjects(rows)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projects])

  const allStatsProjects = useMemo<StatsProject[]>(() => {
    const out: StatsProject[] = projects.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      archived: false
    }))
    const activeIds = new Set(projects.map((p) => p.id))
    for (const a of archivedProjects) {
      if (activeIds.has(a.id)) continue
      out.push({ id: a.id, name: a.name, path: a.path, archived: true })
    }
    return out
  }, [projects, archivedProjects])

  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>('year')
  const [historyMetric, setHistoryMetric] = useState<HistoryMetric>('hours')
  const [historyView, setHistoryView] = useState<HistoryView>('timeline')
  const [historyProjectId, setHistoryProjectId] = useState<string | null>(null)
  const [historyCommits, setHistoryCommits] = useState<ProjectCommits[]>([])
  const [historyActivity, setHistoryActivity] = useState<ActivitySessionInput[]>([])
  const [historyFromMs, setHistoryFromMs] = useState<number | null>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 30)
    return d.getTime()
  })
  const [historyToMs, setHistoryToMs] = useState<number | null>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })

  const currentHistoryRange = useMemo(
    () => historyRange(historyWindow, historyFromMs, historyToMs),
    [historyWindow, historyFromMs, historyToMs]
  )

  useEffect(() => {
    const mapped: TimeRange['key'] =
      historyWindow === 'today' ? 'today'
      : historyWindow === 'week' ? 'week'
      : historyWindow === 'month' ? 'month'
      : historyWindow === 'year' ? 'ytd'
      : 'all'
    if (mapped !== range) setRange(mapped)
  }, [historyWindow, range, setRange])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      setLoading(true)
      const sinceMs = rangeStartMs(range)
      const sinceIso = sinceMs === null ? null : new Date(sinceMs).toISOString()
      const results = await Promise.all(
        allStatsProjects.map(async (p) => {
          try {
            const isRepo = await window.api.git.isRepo(p.path)
            if (!isRepo) return null
            const [commits, languages, userEmail] = await Promise.all([
              window.api.git.commitsSince(p.path, sinceIso),
              window.api.git.languageTally(p.path),
              window.api.git.userEmail(p.path)
            ])
            return {
              projectId: p.id,
              projectName: p.archived ? `${p.name} (archived)` : p.name,
              commits,
              languages,
              userEmail
            }
          } catch {
            return null
          }
        })
      )
      if (cancelled) return
      setData(results.filter((r): r is ProjectData => r !== null))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [allStatsProjects, range])

  useEffect(() => {
    if (source === 'commits') {
      setActivity([])
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      const sinceMs = rangeStartMs(range)
      const sinceIso = sinceMs === null ? null : new Date(sinceMs).toISOString()
      const sessions = await window.api.activity.allSessions(sinceIso, idleMinutes)
      if (cancelled) return
      setActivity(sessions as ActivitySessionInput[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [range, source, idleMinutes, allStatsProjects])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const sinceIso = new Date(currentHistoryRange.start).toISOString()
      const results = await Promise.all(
        allStatsProjects.map(async (p) => {
          try {
            const isRepo = await window.api.git.isRepo(p.path)
            if (!isRepo) return null
            const [commits, userEmail] = await Promise.all([
              window.api.git.commitsSince(p.path, sinceIso) as Promise<StatsCommit[]>,
              window.api.git.userEmail(p.path) as Promise<string>
            ])
            return {
              projectId: p.id,
              projectName: p.archived ? `${p.name} (archived)` : p.name,
              commits,
              userEmail
            }
          } catch {
            return null
          }
        })
      )
      if (cancelled) return
      const filtered = results.filter((r): r is NonNullable<typeof r> => r !== null)
      setHistoryCommits(
        filtered.map((r) => ({
          projectId: r.projectId,
          projectName: r.projectName,
          commits: includeAllAuthors ? r.commits : r.commits.filter((c: StatsCommit) => c.authorEmail === r.userEmail)
        }))
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [allStatsProjects, currentHistoryRange.start, includeAllAuthors])

  useEffect(() => {
    if (source === 'commits') {
      setHistoryActivity([])
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      const sinceIso = new Date(currentHistoryRange.start).toISOString()
      const sessions = await window.api.activity.allSessions(sinceIso, idleMinutes)
      if (cancelled) return
      setHistoryActivity(sessions as ActivitySessionInput[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentHistoryRange.start, source, idleMinutes, allStatsProjects])

  const colorForProject = useMemo(() => {
    const map: Record<string, string> = {}
    const sorted = [...data].map((d) => d.projectId).sort()
    sorted.forEach((id, i) => {
      map[id] = palette.colors[i % palette.colors.length]
    })
    return map
  }, [data, palette])

  const colorForAnyProject = useMemo(() => {
    const map: Record<string, string> = {}
    const sorted = allStatsProjects.map((p) => p.id).sort()
    sorted.forEach((id, i) => {
      map[id] = palette.colors[i % palette.colors.length]
    })
    return map
  }, [allStatsProjects, palette])

  const filteredCommits = useMemo<ProjectCommits[]>(() => {
    return data.map((d) => ({
      projectId: d.projectId,
      projectName: d.projectName,
      commits: includeAllAuthors
        ? d.commits
        : d.commits.filter((c) => c.authorEmail === d.userEmail)
    }))
  }, [data, includeAllAuthors])

  const projectNameById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const p of allStatsProjects) map[p.id] = p.archived ? `${p.name} (archived)` : p.name
    return map
  }, [allStatsProjects])

  const sessions = useMemo<Session[]>(() => {
    const commitSessions = buildSessions(filteredCommits, gapMinutes, leadInMinutes)
    const activitySessions = activityToSessions(activity, projectNameById)
    let combined: Session[]
    if (source === 'commits') combined = commitSessions
    else if (source === 'terminal') combined = activitySessions
    else combined = mergeSessions([...commitSessions, ...activitySessions])
    return clipSessionsToRange(combined, rangeStartMs(range))
  }, [filteredCommits, activity, projectNameById, gapMinutes, leadInMinutes, range, source])

  const perProjectHours = useMemo(() => {
    const map: Record<string, { projectId: string; projectName: string; ms: number }> = {}
    for (const s of sessions) {
      if (!map[s.projectId]) {
        map[s.projectId] = { projectId: s.projectId, projectName: s.projectName, ms: 0 }
      }
      map[s.projectId].ms += s.durationMs
    }
    return Object.values(map).sort((a, b) => b.ms - a.ms)
  }, [sessions])

  const totalMs = useMemo(() => sessions.reduce((acc, s) => acc + s.durationMs, 0), [sessions])

  const todayMs = useMemo(() => {
    const start = rangeStartMs('today')!
    const commitSessions = buildSessions(filteredCommits, gapMinutes, leadInMinutes)
    const activitySessions = activityToSessions(activity, projectNameById)
    let combined: Session[]
    if (source === 'commits') combined = commitSessions
    else if (source === 'terminal') combined = activitySessions
    else combined = mergeSessions([...commitSessions, ...activitySessions])
    const todaySessions = clipSessionsToRange(combined, start)
    return todaySessions.reduce((acc, s) => acc + s.durationMs, 0)
  }, [filteredCommits, activity, projectNameById, gapMinutes, leadInMinutes, source])

  const topProject = perProjectHours[0]?.projectName ?? '—'

  const avgSessionMs = sessions.length > 0 ? totalMs / sessions.length : 0

  const timelineData = useMemo(() => {
    const startMs = rangeStartMs(range) ?? (sessions.length > 0 ? Math.min(...sessions.map((s) => s.start)) : Date.now())
    const endMs = Date.now()
    const buckets = buildBuckets(startMs, endMs, range)
    const rows = buckets.map((b) => {
      const row: Record<string, number | string> = { label: b.label, _start: b.start, _end: b.end }
      for (const p of perProjectHours) row[p.projectName] = 0
      return row
    })

    for (const s of sessions) {
      for (const bucketIdx of bucketIndicesFor(s, buckets)) {
        const overlap = Math.min(s.end, buckets[bucketIdx].end) - Math.max(s.start, buckets[bucketIdx].start)
        if (overlap <= 0) continue
        const name = s.projectName
        rows[bucketIdx][name] = ((rows[bucketIdx][name] as number) ?? 0) + overlap / 3_600_000
      }
    }
    return rows
  }, [sessions, perProjectHours, range])

  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    const commitSessions = buildSessions(filteredCommits, gapMinutes, leadInMinutes)
    const activitySessions = activityToSessions(activity, projectNameById)
    let allTimeSessions: Session[]
    if (source === 'commits') allTimeSessions = commitSessions
    else if (source === 'terminal') allTimeSessions = activitySessions
    else allTimeSessions = mergeSessions([...commitSessions, ...activitySessions])
    for (const s of allTimeSessions) {
      const d = new Date(s.start)
      const dayIdx = (d.getDay() + 6) % 7
      const hour = d.getHours()
      grid[dayIdx][hour] += s.durationMs / 3_600_000
    }
    const max = Math.max(...grid.flat(), 0.0001)
    return { grid, max }
  }, [filteredCommits, activity, projectNameById, gapMinutes, leadInMinutes, source])

  useEffect(() => {
    if (historyProjectId && !allStatsProjects.some((p) => p.id === historyProjectId)) {
      setHistoryProjectId(null)
    }
  }, [allStatsProjects, historyProjectId])

  const historySessions = useMemo<Session[]>(() => {
    const commitSessions = buildSessions(historyCommits, gapMinutes, leadInMinutes)
    const activitySessions = activityToSessions(historyActivity, projectNameById)
    let combined: Session[]
    if (source === 'commits') combined = commitSessions
    else if (source === 'terminal') combined = activitySessions
    else combined = mergeSessions([...commitSessions, ...activitySessions])
    const clipped = clipSessionsToRange(combined, currentHistoryRange.start)
    return clipped.filter((s) => s.start <= currentHistoryRange.end)
  }, [historyCommits, historyActivity, projectNameById, gapMinutes, leadInMinutes, source, currentHistoryRange.start, currentHistoryRange.end])

  const historyFilteredSessions = useMemo<Session[]>(() => {
    if (!historyProjectId) return historySessions
    return historySessions.filter((s) => s.projectId === historyProjectId)
  }, [historySessions, historyProjectId])

  const historyFilteredCommits = useMemo<StatsCommit[]>(() => {
    const { start, end } = currentHistoryRange
    const out: StatsCommit[] = []
    for (const pc of historyCommits) {
      if (historyProjectId && pc.projectId !== historyProjectId) continue
      for (const c of pc.commits) {
        if (c.timestamp < start || c.timestamp > end) continue
        out.push(c)
      }
    }
    return out
  }, [historyCommits, currentHistoryRange.start, currentHistoryRange.end, historyProjectId])

  const historyCalendar = useMemo(() => {
    return buildHistoryCalendar({
      startMs: currentHistoryRange.start,
      endMs: currentHistoryRange.end,
      windowEndMs: currentHistoryRange.windowEnd,
      sessions: historyFilteredSessions,
      commits: historyFilteredCommits,
      metric: historyMetric
    })
  }, [currentHistoryRange.start, currentHistoryRange.end, currentHistoryRange.windowEnd, historyMetric, historyFilteredSessions, historyFilteredCommits])

  const historyStats = useMemo(() => computeHistoryStats(historyCalendar), [historyCalendar])

  const languagePie = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const d of data) {
      for (const [lang, count] of Object.entries(d.languages)) {
        totals[lang] = (totals[lang] ?? 0) + count
      }
    }
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [data])

  type ProjectSortKey = 'project' | 'hours' | 'sessions' | 'commits' | 'lastActive'
  type SortDir = 'asc' | 'desc'

  const [projectSortKey, setProjectSortKey] = useState<ProjectSortKey>('hours')
  const [projectSortDir, setProjectSortDir] = useState<SortDir>('desc')

  const commitsByProjectInRange = useMemo<Record<string, number>>(() => {
    const startMs = rangeStartMs(range)
    const map: Record<string, number> = {}
    for (const p of filteredCommits) {
      let count = 0
      for (const c of p.commits) {
        if (startMs !== null && c.timestamp < startMs) continue
        count++
      }
      map[p.projectId] = count
    }
    return map
  }, [filteredCommits, range])

  interface ProjectRow {
    projectId: string
    projectName: string
    totalMs: number
    sessionCount: number
    commitCount: number
    lastActive: number
  }

  const projectRows = useMemo<ProjectRow[]>(() => {
    const map: Record<string, ProjectRow> = {}
    for (const s of sessions) {
      let row = map[s.projectId]
      if (!row) {
        row = {
          projectId: s.projectId,
          projectName: s.projectName,
          totalMs: 0,
          sessionCount: 0,
          commitCount: 0,
          lastActive: 0
        }
        map[s.projectId] = row
      }
      row.totalMs += s.durationMs
      row.sessionCount += 1
      if (s.end > row.lastActive) row.lastActive = s.end
    }
    for (const projectId of Object.keys(commitsByProjectInRange)) {
      if (!map[projectId]) continue
      map[projectId].commitCount = commitsByProjectInRange[projectId]
    }
    const rows = Object.values(map)
    const dir = projectSortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      let cmp = 0
      if (projectSortKey === 'project') cmp = a.projectName.localeCompare(b.projectName)
      else if (projectSortKey === 'hours') cmp = a.totalMs - b.totalMs
      else if (projectSortKey === 'sessions') cmp = a.sessionCount - b.sessionCount
      else if (projectSortKey === 'commits') cmp = a.commitCount - b.commitCount
      else cmp = a.lastActive - b.lastActive
      if (cmp === 0) cmp = b.totalMs - a.totalMs
      return cmp * dir
    })
    return rows
  }, [sessions, commitsByProjectInRange, projectSortKey, projectSortDir])

  const toggleProjectSort = (key: ProjectSortKey): void => {
    if (projectSortKey === key) setProjectSortDir(projectSortDir === 'asc' ? 'desc' : 'asc')
    else {
      setProjectSortKey(key)
      setProjectSortDir(key === 'project' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="min-h-full p-6 text-zinc-200">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Statistics</h1>
          {loading && <span className="text-xs text-zinc-500">Loading…</span>}
        </div>

        <HistoricalWorkCard
          calendar={historyCalendar}
          window={historyWindow}
          setWindow={setHistoryWindow}
          metric={historyMetric}
          setMetric={setHistoryMetric}
          view={historyView}
          setView={setHistoryView}
          source={source}
          setSource={setSource}
          includeAllAuthors={includeAllAuthors}
          setIncludeAllAuthors={setIncludeAllAuthors}
          gapMinutes={gapMinutes}
          setGapMinutes={setGapMinutes}
          leadInMinutes={leadInMinutes}
          setLeadInMinutes={setLeadInMinutes}
          idleMinutes={idleMinutes}
          setIdleMinutes={setIdleMinutes}
          sessions={historyFilteredSessions}
          range={currentHistoryRange}
          colorForProject={colorForAnyProject}
          projectId={historyProjectId}
          setProjectId={setHistoryProjectId}
          projects={allStatsProjects.map((p) => ({ id: p.id, name: p.archived ? `${p.name} (archived)` : p.name }))}
          fromMs={historyFromMs}
          setFromMs={setHistoryFromMs}
          toMs={historyToMs}
          setToMs={setHistoryToMs}
          baseColor={palette.heatmapBase}
          emptyColor={palette.emptyCell}
        />

        <Section title="Overview">
          <div className="grid grid-cols-4 gap-3">
            <Kpi icon={<Flame size={14} />} label="Current streak" value={`${historyStats.currentStreak} day${historyStats.currentStreak === 1 ? '' : 's'}`} />
            <Kpi icon={<Trophy size={14} />} label="Longest streak" value={`${historyStats.longestStreak} day${historyStats.longestStreak === 1 ? '' : 's'}`} />
            <Kpi icon={<CalendarCheck size={14} />} label="Active days" value={`${historyStats.activeDays} / ${historyStats.possibleDays}`} />
            <Kpi icon={<Clock size={14} />} label="Total time" value={formatHours(totalMs)} />
            <Kpi icon={<CalendarDays size={14} />} label="Today" value={formatHours(todayMs)} />
            <Kpi icon={<Folder size={14} />} label="Top project" value={topProject} />
            <Kpi icon={<Timer size={14} />} label="Avg session" value={formatDuration(avgSessionMs)} />
          </div>

          <Card title={`Timeline (${TIME_RANGES.find((r) => r.key === range)?.label})`}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={timelineData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <XAxis dataKey="label" stroke={palette.axis} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis stroke={palette.axis} tick={{ fontSize: 11 }} unit="h" />
                <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${(v as number).toFixed(2)}h`} />
                {perProjectHours.map((p) => (
                  <Bar key={p.projectId} dataKey={p.projectName} stackId="s" fill={colorForProject[p.projectId]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Section>

        <Section title="Breakdown">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Hours per project">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={perProjectHours.map((p) => ({ name: p.projectName, hours: p.ms / 3_600_000 }))} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <XAxis type="number" stroke={palette.axis} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" stroke={palette.axis} tick={{ fontSize: 11 }} width={120} />
                  <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${(v as number).toFixed(2)}h`} />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {perProjectHours.map((p) => (
                      <Cell key={p.projectId} fill={colorForProject[p.projectId]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Project time share">
              <ResponsiveContainer width="100%" height={260}>
                <RPieChart>
                  <Pie
                    data={perProjectHours.map((p) => ({ name: p.projectName, value: p.ms / 3_600_000, projectId: p.projectId }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {perProjectHours.map((p) => (
                      <Cell key={p.projectId} fill={colorForProject[p.projectId]} />
                    ))}
                  </Pie>
                  <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }} contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${(v as number).toFixed(2)}h`} />
                </RPieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </Section>

        <Section title="Patterns">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title={`Activity pattern (${TIME_RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? range})`}>
              <Heatmap grid={heatmap.grid} max={heatmap.max} baseColor={palette.heatmapBase} emptyColor={palette.emptyCell} />
            </Card>

            <Card title="Code languages (HEAD)">
              <ResponsiveContainer width="100%" height={260}>
                <RPieChart>
                  <Pie data={languagePie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {languagePie.map((_, i) => (
                      <Cell key={i} fill={palette.colors[i % palette.colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }} contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${v as number} files`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RPieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </Section>

        <Section title="Projects">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xs text-zinc-500">{projectRows.length} projects</span>
          </div>

          {projectRows.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-500">No activity in range</div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs">
                <colgroup>
                  <col />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-48" />
                </colgroup>
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="text-left text-zinc-500">
                    <SortHeader label="Project" active={projectSortKey === 'project'} dir={projectSortDir} onClick={() => toggleProjectSort('project')} />
                    <SortHeader label="Time" active={projectSortKey === 'hours'} dir={projectSortDir} onClick={() => toggleProjectSort('hours')} align="right" />
                    <SortHeader label="Sessions" active={projectSortKey === 'sessions'} dir={projectSortDir} onClick={() => toggleProjectSort('sessions')} align="right" />
                    <SortHeader label="Commits" active={projectSortKey === 'commits'} dir={projectSortDir} onClick={() => toggleProjectSort('commits')} align="right" />
                    <SortHeader label="Last active" active={projectSortKey === 'lastActive'} dir={projectSortDir} onClick={() => toggleProjectSort('lastActive')} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {projectRows.map((p) => (
                    <tr key={p.projectId} className="border-t border-zinc-800">
                      <td className="py-1.5">
                        <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorForProject[p.projectId] }} />
                        <span className="ml-2">{p.projectName}</span>
                      </td>
                      <td className="py-1.5 text-right text-zinc-300 tabular-nums">{formatDuration(p.totalMs)}</td>
                      <td className="py-1.5 text-right text-zinc-400 tabular-nums">{p.sessionCount}</td>
                      <td className="py-1.5 text-right text-zinc-400 tabular-nums">{p.commitCount}</td>
                      <td className="py-1.5 text-right text-zinc-400 tabular-nums">{p.lastActive ? new Date(p.lastActive).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </Section>

        {archivedProjects.length > 0 && (
          <Section title="Archived projects">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="space-y-2">
                {archivedProjects.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-zinc-300">{a.name}</div>
                      <div className="truncate text-[10px] text-zinc-500" title={a.path}>{a.path}</div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={async () => {
                          await window.api.projects.unarchive(a.id)
                          await loadProjects()
                          const rows = (await window.api.projects.listArchived()) as ArchivedProjectInfo[]
                          setArchivedProjects(rows)
                        }}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                      >
                        Unarchive
                      </button>
                      <button
                        onClick={async () => {
                          await window.api.projects.deleteArchived(a.id)
                          const rows = (await window.api.projects.listArchived()) as ArchivedProjectInfo[]
                          setArchivedProjects(rows)
                        }}
                        className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-red-700 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

interface SessionSettingsPopoverProps {
  source: SessionSource
  includeAllAuthors: boolean
  setIncludeAllAuthors: (v: boolean) => void
  gapMinutes: number
  setGapMinutes: (v: number) => void
  leadInMinutes: number
  setLeadInMinutes: (v: number) => void
  idleMinutes: number
  setIdleMinutes: (v: number) => void
}

function SessionSettingsPopover({
  source,
  includeAllAuthors,
  setIncludeAllAuthors,
  gapMinutes,
  setGapMinutes,
  leadInMinutes,
  setLeadInMinutes,
  idleMinutes,
  setIdleMinutes
}: SessionSettingsPopoverProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const showCommitFields = source !== 'terminal'
  const showIdle = source !== 'commits'

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium transition-colors',
          open ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
        )}
      >
        <SlidersHorizontal size={12} />
        Session settings
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-md border border-zinc-800 bg-zinc-900 p-3 shadow-lg">
          <div className="space-y-3">
            {showCommitFields && (
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeAllAuthors}
                  onChange={(e) => setIncludeAllAuthors(e.target.checked)}
                  className="h-3 w-3 accent-zinc-400"
                />
                Include all authors
              </label>
            )}
            {showCommitFields && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Gap</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={gapMinutes}
                    onChange={(e) => setGapMinutes(Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 30)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {showCommitFields && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Lead-in</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={leadInMinutes}
                    onChange={(e) => setLeadInMinutes(Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 15)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {showIdle && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Idle</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={idleMinutes}
                    onChange={(e) => setIdleMinutes(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {!showCommitFields && !showIdle && (
              <div className="text-xs text-zinc-500">No advanced settings for this source.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-100 truncate" title={value}>{value}</div>
    </div>
  )
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-zinc-400">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

interface HistoricalWorkCardProps {
  calendar: HistoryCalendarData
  window: HistoryWindow
  setWindow: (w: HistoryWindow) => void
  metric: HistoryMetric
  setMetric: (m: HistoryMetric) => void
  view: HistoryView
  setView: (v: HistoryView) => void
  sessions: Session[]
  range: HistoryRange
  colorForProject: Record<string, string>
  projectId: string | null
  setProjectId: (id: string | null) => void
  projects: { id: string; name: string }[]
  fromMs: number | null
  setFromMs: (ms: number | null) => void
  toMs: number | null
  setToMs: (ms: number | null) => void
  baseColor: string
  emptyColor: string
  source: SessionSource
  setSource: (s: SessionSource) => void
  includeAllAuthors: boolean
  setIncludeAllAuthors: (v: boolean) => void
  gapMinutes: number
  setGapMinutes: (v: number) => void
  leadInMinutes: number
  setLeadInMinutes: (v: number) => void
  idleMinutes: number
  setIdleMinutes: (v: number) => void
}

function HistoricalWorkCard({
  calendar,
  window: historyWindow,
  setWindow,
  metric,
  setMetric,
  view,
  setView,
  sessions,
  range,
  colorForProject,
  projectId,
  setProjectId,
  projects,
  fromMs,
  setFromMs,
  toMs,
  setToMs,
  baseColor,
  emptyColor,
  source,
  setSource,
  includeAllAuthors,
  setIncludeAllAuthors,
  gapMinutes,
  setGapMinutes,
  leadInMinutes,
  setLeadInMinutes,
  idleMinutes,
  setIdleMinutes
}: HistoricalWorkCardProps): React.ReactElement {
  const hasCells = calendar.weeks.length > 0 && computeHistoryStats(calendar).possibleDays > 0

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-zinc-400">Historical work</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            {SOURCE_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setSource(o.key)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  source === o.key ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            {HISTORY_WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setWindow(w.key)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  historyWindow === w.key ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            <button
              onClick={() => setView('timeline')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                view === 'timeline' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              Timeline
            </button>
            <button
              onClick={() => setView('heatmap')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                view === 'heatmap' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              Heatmap
            </button>
          </div>
          {view === 'heatmap' && (
            <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
              <button
                onClick={() => setMetric('hours')}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  metric === 'hours' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Hours
              </button>
              <button
                onClick={() => setMetric('commits')}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  metric === 'commits' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Commits
              </button>
            </div>
          )}
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <SessionSettingsPopover
            source={source}
            includeAllAuthors={includeAllAuthors}
            setIncludeAllAuthors={setIncludeAllAuthors}
            gapMinutes={gapMinutes}
            setGapMinutes={setGapMinutes}
            leadInMinutes={leadInMinutes}
            setLeadInMinutes={setLeadInMinutes}
            idleMinutes={idleMinutes}
            setIdleMinutes={setIdleMinutes}
          />
        </div>
      </div>

      {historyWindow === 'custom' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span>From</span>
          <input
            type="date"
            value={fromMs !== null ? formatDateInput(fromMs) : ''}
            max={toMs !== null ? formatDateInput(toMs) : undefined}
            onChange={(e) => setFromMs(parseDateInput(e.target.value))}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          />
          <span>to</span>
          <input
            type="date"
            value={toMs !== null ? formatDateInput(toMs) : ''}
            min={fromMs !== null ? formatDateInput(fromMs) : undefined}
            max={formatDateInput(Date.now())}
            onChange={(e) => setToMs(parseDateInput(e.target.value))}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          />
        </div>
      )}

      {view === 'timeline' ? (
        <DailyTimeline
          sessions={sessions}
          range={range}
          colorForProject={colorForProject}
          emptyColor={emptyColor}
        />
      ) : hasCells ? (
        <YearHeatmap calendar={calendar} baseColor={baseColor} emptyColor={emptyColor} />
      ) : (
        <div className="py-6 text-center text-xs text-zinc-500">No activity in this window</div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left'
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}): React.ReactElement {
  return (
    <th className={cn('py-1.5 font-medium', align === 'right' && 'text-right')}>
      <button
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-zinc-200 transition-colors',
          active ? 'text-zinc-200' : 'text-zinc-500'
        )}
      >
        {label}
        <span className="text-[9px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface HistoryCalendarCell {
  dateMs: number
  hours: number
  commits: number
  topProjectName: string | null
  topProjectMs: number
}

interface HistoryCalendarData {
  weeks: HistoryCalendarCell[][]
  max: number
  metric: HistoryMetric
  startMs: number
  endMs: number
  windowEndMs: number
}

function startOfWeekMs(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDaysMs(ms: number, days: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

function buildHistoryCalendar({
  startMs,
  endMs,
  sessions,
  commits,
  metric,
  windowEndMs
}: {
  startMs: number
  endMs: number
  windowEndMs: number
  sessions: Session[]
  commits: StatsCommit[]
  metric: HistoryMetric
}): HistoryCalendarData {
  const weekStart = startOfWeekMs(startMs)
  const hoursPerDay = new Map<number, number>()
  const commitsPerDay = new Map<number, number>()
  const projectMsPerDay = new Map<number, Map<string, number>>()

  for (const s of sessions) {
    const segStart = Math.max(s.start, weekStart)
    const segEnd = Math.min(s.end, endMs)
    if (segEnd <= segStart) continue
    let cursor = startOfDayMs(segStart)
    while (cursor <= segEnd) {
      const dayEnd = addDaysMs(cursor, 1)
      const overlap = Math.min(segEnd, dayEnd) - Math.max(segStart, cursor)
      if (overlap > 0) {
        hoursPerDay.set(cursor, (hoursPerDay.get(cursor) ?? 0) + overlap / 3_600_000)
        let perProject = projectMsPerDay.get(cursor)
        if (!perProject) {
          perProject = new Map<string, number>()
          projectMsPerDay.set(cursor, perProject)
        }
        perProject.set(s.projectName, (perProject.get(s.projectName) ?? 0) + overlap)
      }
      cursor = dayEnd
    }
  }

  for (const c of commits) {
    if (c.timestamp < weekStart || c.timestamp > endMs) continue
    const day = startOfDayMs(c.timestamp)
    commitsPerDay.set(day, (commitsPerDay.get(day) ?? 0) + 1)
  }

  const weeks: HistoryCalendarCell[][] = []
  let max = 0.0001
  let weekCursor = weekStart
  while (weekCursor <= windowEndMs) {
    const week: HistoryCalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const dayMs = addDaysMs(weekCursor, d)
      const hours = hoursPerDay.get(dayMs) ?? 0
      const commitCount = commitsPerDay.get(dayMs) ?? 0
      let topProjectName: string | null = null
      let topProjectMs = 0
      const perProject = projectMsPerDay.get(dayMs)
      if (perProject) {
        perProject.forEach((ms, name) => {
          if (ms > topProjectMs) {
            topProjectMs = ms
            topProjectName = name
          }
        })
      }
      const value = metric === 'hours' ? hours : commitCount
      if (value > max) max = value
      week.push({ dateMs: dayMs, hours, commits: commitCount, topProjectName, topProjectMs })
    }
    weeks.push(week)
    weekCursor = addDaysMs(weekCursor, 7)
  }
  return { weeks, max, metric, startMs: weekStart, endMs, windowEndMs }
}

interface HistoryStats {
  totalHours: number
  totalCommits: number
  activeDays: number
  possibleDays: number
  currentStreak: number
  longestStreak: number
}

function computeHistoryStats(calendar: HistoryCalendarData): HistoryStats {
  const now = Date.now()
  let totalHours = 0
  let totalCommits = 0
  let activeDays = 0
  let possibleDays = 0
  let longestStreak = 0
  let currentStreak = 0
  let runningStreak = 0
  const today = startOfDayMs(now)
  const dayValues: { dateMs: number; active: boolean }[] = []
  for (const week of calendar.weeks) {
    for (const cell of week) {
      if (cell.dateMs > calendar.windowEndMs) continue
      if (cell.dateMs < calendar.startMs) continue
      possibleDays += 1
      if (cell.dateMs > now) continue
      totalHours += cell.hours
      totalCommits += cell.commits
      const active = calendar.metric === 'hours' ? cell.hours > 0 : cell.commits > 0
      if (active) activeDays += 1
      dayValues.push({ dateMs: cell.dateMs, active })
    }
  }
  dayValues.sort((a, b) => a.dateMs - b.dateMs)
  for (const d of dayValues) {
    if (d.active) {
      runningStreak += 1
      if (runningStreak > longestStreak) longestStreak = runningStreak
    } else {
      runningStreak = 0
    }
  }
  for (let i = dayValues.length - 1; i >= 0; i--) {
    const d = dayValues[i]
    if (d.dateMs === today && !d.active) continue
    if (d.active) currentStreak += 1
    else break
  }
  return { totalHours, totalCommits, activeDays, possibleDays, currentStreak, longestStreak }
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function YearHeatmap({
  calendar,
  baseColor,
  emptyColor
}: {
  calendar: HistoryCalendarData
  baseColor: string
  emptyColor: string
}): React.ReactElement {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const [r, g, b] = hexToRgb(baseColor)
  const now = Date.now()
  const monthRow = calendar.weeks.map((week, i) => {
    if (week.every((c) => c.dateMs < calendar.startMs || c.dateMs > calendar.endMs)) return ''
    const firstInWindow = week.find((c) => c.dateMs >= calendar.startMs && c.dateMs <= calendar.endMs) ?? week[0]
    const d = new Date(firstInWindow.dateMs)
    const month = d.getMonth()
    if (i === 0) return MONTH_LABELS[month]
    const prevWeek = calendar.weeks[i - 1]
    const prevFirstInWindow = prevWeek.find((c) => c.dateMs >= calendar.startMs && c.dateMs <= calendar.endMs)
    if (!prevFirstInWindow) return MONTH_LABELS[month]
    const prevMonth = new Date(prevFirstInWindow.dateMs).getMonth()
    return prevMonth === month ? '' : MONTH_LABELS[month]
  })
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex h-3 text-[10px] text-zinc-500">
          <div className="w-8 shrink-0" />
          {monthRow.map((label, i) => (
            <div key={i} className="relative w-[14px] shrink-0">
              {label && <span className="absolute left-0 top-0 whitespace-nowrap">{label}</span>}
            </div>
          ))}
        </div>
        {days.map((day, dayIdx) => (
          <div key={day} className="flex items-center">
            <div className="w-8 text-[10px] text-zinc-500">{dayIdx % 2 === 0 ? day : ''}</div>
            {calendar.weeks.map((week, wIdx) => {
              const cell = week[dayIdx]
              const outOfWindow = cell.dateMs > now || cell.dateMs > calendar.endMs || cell.dateMs < calendar.startMs
              const value = calendar.metric === 'hours' ? cell.hours : cell.commits
              const intensity = value / calendar.max
              const bg = outOfWindow
                ? 'transparent'
                : value === 0
                  ? emptyColor
                  : `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.85})`
              const dateLabel = new Date(cell.dateMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              const tip = outOfWindow
                ? dateLabel
                : `${dateLabel} — ${cell.hours.toFixed(2)}h · ${cell.commits} commit${cell.commits === 1 ? '' : 's'}${cell.topProjectName ? ` · ${cell.topProjectName}` : ''}`
              return (
                <div
                  key={wIdx}
                  className="m-px h-[12px] w-[12px] rounded-sm border border-zinc-800"
                  style={{ background: bg, opacity: outOfWindow ? 0.15 : 1 }}
                  title={tip}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface DailyTimelineProps {
  sessions: Session[]
  range: HistoryRange
  colorForProject: Record<string, string>
  emptyColor: string
}

interface DayBlock {
  projectId: string
  projectName: string
  startHour: number
  endHour: number
  start: number
  end: number
  durationMs: number
}

interface DayRow {
  dateMs: number
  blocks: DayBlock[]
  totalMs: number
  byProject: Map<string, number>
}

function buildDayRows(sessions: Session[], range: HistoryRange): DayRow[] {
  const byDay = new Map<number, DayRow>()
  const ensureDay = (dayMs: number): DayRow => {
    let row = byDay.get(dayMs)
    if (!row) {
      row = { dateMs: dayMs, blocks: [], totalMs: 0, byProject: new Map() }
      byDay.set(dayMs, row)
    }
    return row
  }
  for (const s of sessions) {
    const segStart = Math.max(s.start, range.start)
    const segEnd = Math.min(s.end, range.end)
    if (segEnd <= segStart) continue
    let cursor = startOfDayMs(segStart)
    while (cursor <= segEnd) {
      const dayEnd = addDaysMs(cursor, 1)
      const blockStart = Math.max(segStart, cursor)
      const blockEnd = Math.min(segEnd, dayEnd)
      if (blockEnd > blockStart) {
        const row = ensureDay(cursor)
        const startHour = (blockStart - cursor) / 3_600_000
        const endHour = (blockEnd - cursor) / 3_600_000
        const dur = blockEnd - blockStart
        row.blocks.push({
          projectId: s.projectId,
          projectName: s.projectName,
          startHour,
          endHour,
          start: blockStart,
          end: blockEnd,
          durationMs: dur
        })
        row.totalMs += dur
        row.byProject.set(s.projectId, (row.byProject.get(s.projectId) ?? 0) + dur)
      }
      cursor = dayEnd
    }
  }
  const rows = Array.from(byDay.values())
  rows.sort((a, b) => b.dateMs - a.dateMs)
  for (const r of rows) r.blocks.sort((a, b) => a.startHour - b.startHour)
  return rows
}

function formatDayLabel(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatHourMinute(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function DailyTimeline({ sessions, range, colorForProject, emptyColor }: DailyTimelineProps): React.ReactElement {
  const rows = useMemo(() => buildDayRows(sessions, range), [sessions, range])
  const projectLegend = useMemo(() => {
    const map = new Map<string, { projectId: string; projectName: string; ms: number }>()
    for (const r of rows) {
      for (const b of r.blocks) {
        const existing = map.get(b.projectId)
        if (existing) existing.ms += b.durationMs
        else map.set(b.projectId, { projectId: b.projectId, projectName: b.projectName, ms: b.durationMs })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.ms - a.ms)
  }, [rows])

  if (rows.length === 0) {
    return <div className="py-6 text-center text-xs text-zinc-500">No activity in this window</div>
  }

  const hourTicks = Array.from({ length: 25 }, (_, i) => i)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="flex items-center pb-1 text-[10px] text-zinc-500">
            <div className="w-28 shrink-0" />
            <div className="relative flex-1">
              <div className="flex">
                {hourTicks.map((h) => (
                  <div
                    key={h}
                    className="relative flex-1"
                    style={{ minWidth: 0 }}
                  >
                    {h % 3 === 0 && h < 24 && (
                      <span className="absolute left-0 -translate-x-1/2 whitespace-nowrap">
                        {h.toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-14 shrink-0 text-right">Total</div>
          </div>

          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.dateMs} className="flex items-center">
                <div className="w-28 shrink-0 text-[11px] text-zinc-400">
                  {formatDayLabel(row.dateMs)}
                </div>
                <div
                  className="relative h-6 flex-1 rounded-sm border border-zinc-800"
                  style={{ background: emptyColor }}
                >
                  {[6, 12, 18].map((h) => (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 w-px bg-zinc-800/80"
                      style={{ left: `${(h / 24) * 100}%` }}
                    />
                  ))}
                  {row.blocks.map((b, i) => {
                    const left = (b.startHour / 24) * 100
                    const width = Math.max(((b.endHour - b.startHour) / 24) * 100, 0.4)
                    const color = colorForProject[b.projectId] ?? '#60a5fa'
                    const tip = `${b.projectName} · ${formatHourMinute(b.start)}–${formatHourMinute(b.end)} · ${formatDuration(b.durationMs)}`
                    return (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 rounded-sm"
                        style={{ left: `${left}%`, width: `${width}%`, background: color }}
                        title={tip}
                      />
                    )
                  })}
                </div>
                <div className="w-14 shrink-0 text-right text-[11px] tabular-nums text-zinc-300">
                  {formatDuration(row.totalMs)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {projectLegend.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-zinc-400">
          {projectLegend.map((p) => (
            <div key={p.projectId} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: colorForProject[p.projectId] ?? '#60a5fa' }}
              />
              <span>{p.projectName}</span>
              <span className="text-zinc-500">· {formatDuration(p.ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Heatmap({ grid, max, baseColor, emptyColor }: { grid: number[][]; max: number; baseColor: string; emptyColor: string }): React.ReactElement {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const [r, g, b] = hexToRgb(baseColor)
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex text-[10px] text-zinc-500">
          <div className="w-8" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-5 text-center">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {grid.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center">
            <div className="w-8 text-[10px] text-zinc-500">{days[dayIdx]}</div>
            {row.map((hours, h) => {
              const intensity = hours / max
              const bg = intensity === 0 ? emptyColor : `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.85})`
              return (
                <div
                  key={h}
                  className="m-px h-5 w-5 rounded-sm border border-zinc-800"
                  style={{ background: bg }}
                  title={`${days[dayIdx]} ${h}:00 — ${hours.toFixed(2)}h`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Bucket {
  label: string
  start: number
  end: number
}

function buildBuckets(startMs: number, endMs: number, range: string): Bucket[] {
  const buckets: Bucket[] = []
  if (range === 'today') {
    const d = new Date(startMs)
    d.setMinutes(0, 0, 0)
    for (let h = 0; h < 24; h++) {
      const s = new Date(d)
      s.setHours(h)
      const e = new Date(s)
      e.setHours(h + 1)
      buckets.push({ label: `${h}`, start: s.getTime(), end: e.getTime() })
    }
    return buckets
  }
  if (range === 'week' || range === 'month') {
    const cursor = new Date(startMs)
    cursor.setHours(0, 0, 0, 0)
    while (cursor.getTime() < endMs) {
      const s = cursor.getTime()
      const next = new Date(cursor)
      next.setDate(next.getDate() + 1)
      buckets.push({
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        start: s,
        end: next.getTime()
      })
      cursor.setTime(next.getTime())
    }
    return buckets
  }
  if (range === 'ytd') {
    const cursor = new Date(startMs)
    cursor.setHours(0, 0, 0, 0)
    const dow = (cursor.getDay() + 6) % 7
    cursor.setDate(cursor.getDate() - dow)
    while (cursor.getTime() < endMs) {
      const s = cursor.getTime()
      const next = new Date(cursor)
      next.setDate(next.getDate() + 7)
      buckets.push({
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        start: s,
        end: next.getTime()
      })
      cursor.setTime(next.getTime())
    }
    return buckets
  }
  const cursor = new Date(startMs)
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  while (cursor.getTime() < endMs) {
    const s = cursor.getTime()
    const next = new Date(cursor)
    next.setMonth(next.getMonth() + 1)
    buckets.push({
      label: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      start: s,
      end: next.getTime()
    })
    cursor.setTime(next.getTime())
  }
  return buckets
}

function bucketIndicesFor(s: Session, buckets: Bucket[]): number[] {
  const out: number[] = []
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].end <= s.start) continue
    if (buckets[i].start >= s.end) break
    out.push(i)
  }
  return out
}
