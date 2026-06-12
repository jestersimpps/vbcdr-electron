import { useEffect, useMemo, useState } from 'react'
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
import { Clock, CalendarDays, Folder, Timer, Flame, Trophy, CalendarCheck } from 'lucide-react'
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
  filterShortSessions,
  mergeSessions,
  formatHours,
  formatDuration,
  type ProjectCommits,
  type Session,
  type ActivitySessionInput,
  type TimeRange
} from '@/lib/sessions'
import {
  historyRange,
  buildHistoryCalendar,
  computeHistoryStats,
  buildBuckets,
  bucketIndicesFor,
  type HistoryWindow,
  type HistoryMetric,
  type HistoryView
} from '@/lib/statistics-helpers'
import type { StatsCommit, LanguageTally } from '@/models/types'
import { Section, Kpi, Card } from '@/components/ui/StatBlocks'
import { HistoricalWorkCard } from '@/components/statistics/HistoricalWorkCard'
import { Heatmap } from '@/components/statistics/Heatmap'
import { SortHeader } from '@/components/statistics/SortHeader'

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
  const minSessionMinutes = useStatsStore((s) => s.minSessionMinutes)
  const setRange = useStatsStore((s) => s.setRange)
  const setGapMinutes = useStatsStore((s) => s.setGapMinutes)
  const setLeadInMinutes = useStatsStore((s) => s.setLeadInMinutes)
  const setIncludeAllAuthors = useStatsStore((s) => s.setIncludeAllAuthors)
  const setSource = useStatsStore((s) => s.setSource)
  const setIdleMinutes = useStatsStore((s) => s.setIdleMinutes)
  const setMinSessionMinutes = useStatsStore((s) => s.setMinSessionMinutes)
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

  const minSessionMs = minSessionMinutes * 60_000

  const combinedSessions = useMemo<Session[]>(() => {
    const commitSessions = buildSessions(filteredCommits, gapMinutes, leadInMinutes)
    const activitySessions = filterShortSessions(activityToSessions(activity, projectNameById), minSessionMs)
    if (source === 'commits') return commitSessions
    if (source === 'terminal') return activitySessions
    return mergeSessions([...commitSessions, ...activitySessions])
  }, [filteredCommits, activity, projectNameById, gapMinutes, leadInMinutes, source, minSessionMs])

  const sessions = useMemo<Session[]>(
    () => clipSessionsToRange(combinedSessions, rangeStartMs(range)),
    [combinedSessions, range]
  )

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
    const todaySessions = clipSessionsToRange(combinedSessions, start)
    return todaySessions.reduce((acc, s) => acc + s.durationMs, 0)
  }, [combinedSessions])

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
    for (const s of combinedSessions) {
      const d = new Date(s.start)
      const dayIdx = (d.getDay() + 6) % 7
      const hour = d.getHours()
      grid[dayIdx][hour] += s.durationMs / 3_600_000
    }
    const max = Math.max(...grid.flat(), 0.0001)
    return { grid, max }
  }, [combinedSessions])

  useEffect(() => {
    if (historyProjectId && !allStatsProjects.some((p) => p.id === historyProjectId)) {
      setHistoryProjectId(null)
    }
  }, [allStatsProjects, historyProjectId])

  const historySessions = useMemo<Session[]>(() => {
    const commitSessions = buildSessions(historyCommits, gapMinutes, leadInMinutes)
    const activitySessions = filterShortSessions(activityToSessions(historyActivity, projectNameById), minSessionMs)
    let combined: Session[]
    if (source === 'commits') combined = commitSessions
    else if (source === 'terminal') combined = activitySessions
    else combined = mergeSessions([...commitSessions, ...activitySessions])
    const clipped = clipSessionsToRange(combined, currentHistoryRange.start)
    return clipped.filter((s) => s.start <= currentHistoryRange.end)
  }, [historyCommits, historyActivity, projectNameById, gapMinutes, leadInMinutes, source, currentHistoryRange.start, currentHistoryRange.end, minSessionMs])

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
          minSessionMinutes={minSessionMinutes}
          setMinSessionMinutes={setMinSessionMinutes}
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
                      <div className="truncate text-micro text-zinc-500" title={a.path}>{a.path}</div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={async () => {
                          await window.api.projects.unarchive(a.id)
                          await loadProjects()
                          const rows = (await window.api.projects.listArchived()) as ArchivedProjectInfo[]
                          setArchivedProjects(rows)
                        }}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-micro text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                      >
                        Unarchive
                      </button>
                      <button
                        onClick={async () => {
                          await window.api.projects.deleteArchived(a.id)
                          const rows = (await window.api.projects.listArchived()) as ArchivedProjectInfo[]
                          setArchivedProjects(rows)
                        }}
                        className="rounded border border-zinc-800 px-2 py-0.5 text-micro text-zinc-500 hover:border-red-700 hover:text-red-400"
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
