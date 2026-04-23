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
  type SessionSource
} from '@/lib/sessions'
import type { StatsCommit, LanguageTally } from '@/models/types'
import { cn } from '@/lib/utils'

const SOURCE_OPTIONS: { key: SessionSource; label: string }[] = [
  { key: 'commits', label: 'Commits' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'both', label: 'Both' }
]

interface ProjectData {
  projectId: string
  projectName: string
  commits: StatsCommit[]
  languages: LanguageTally
  userEmail: string
}

export function Statistics(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
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

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      setLoading(true)
      const sinceMs = rangeStartMs(range)
      const sinceIso = sinceMs === null ? null : new Date(sinceMs).toISOString()
      const results = await Promise.all(
        projects.map(async (p) => {
          const isRepo = await window.api.git.isRepo(p.path)
          if (!isRepo) return null
          const [commits, languages, userEmail] = await Promise.all([
            window.api.git.commitsSince(p.path, sinceIso),
            window.api.git.languageTally(p.path),
            window.api.git.userEmail(p.path)
          ])
          return { projectId: p.id, projectName: p.name, commits, languages, userEmail }
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
  }, [projects, range])

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
  }, [range, source, idleMinutes, projects])

  const colorForProject = useMemo(() => {
    const map: Record<string, string> = {}
    const sorted = [...data].map((d) => d.projectId).sort()
    sorted.forEach((id, i) => {
      map[id] = palette.colors[i % palette.colors.length]
    })
    return map
  }, [data, palette])

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
    for (const p of projects) map[p.id] = p.name
    return map
  }, [projects])

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

  const recentSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.end - a.end).slice(0, 12)
  }, [sessions])

  return (
    <div className="min-h-full bg-zinc-950 p-6 text-zinc-200">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Statistics</h1>
          <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            {TIME_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  range === r.key ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            {SOURCE_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setSource(o.key)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  source === o.key ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {source !== 'terminal' && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={includeAllAuthors}
                onChange={(e) => setIncludeAllAuthors(e.target.checked)}
                className="h-3 w-3 accent-zinc-400"
              />
              Include all authors
            </label>
          )}
          {source !== 'terminal' && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              Gap
              <input
                type="number"
                min={1}
                max={240}
                value={gapMinutes}
                onChange={(e) => setGapMinutes(Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 30)))}
                className="w-14 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-xs"
              />
              min
            </label>
          )}
          {source !== 'terminal' && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              Lead-in
              <input
                type="number"
                min={0}
                max={120}
                value={leadInMinutes}
                onChange={(e) => setLeadInMinutes(Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 15)))}
                className="w-14 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-xs"
              />
              min
            </label>
          )}
          {source !== 'commits' && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              Idle
              <input
                type="number"
                min={1}
                max={60}
                value={idleMinutes}
                onChange={(e) => setIdleMinutes(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5)))}
                className="w-14 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-xs"
              />
              min
            </label>
          )}
          {loading && <span className="text-xs text-zinc-500">Loading…</span>}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Kpi label="Total time" value={formatHours(totalMs)} />
          <Kpi label="Today" value={formatHours(todayMs)} />
          <Kpi label="Top project" value={topProject} />
          <Kpi label="Avg session" value={formatDuration(avgSessionMs)} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card title="Hours per project">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={perProjectHours.map((p) => ({ name: p.projectName, hours: p.ms / 3_600_000 }))} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <XAxis type="number" stroke={palette.axis} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" stroke={palette.axis} tick={{ fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${(v as number).toFixed(2)}h`} />
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
                <Tooltip contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${(v as number).toFixed(2)}h`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RPieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card title={`Timeline (${TIME_RANGES.find((r) => r.key === range)?.label})`}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={timelineData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <XAxis dataKey="label" stroke={palette.axis} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={palette.axis} tick={{ fontSize: 11 }} unit="h" />
              <Tooltip contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${(v as number).toFixed(2)}h`} />
              {perProjectHours.map((p) => (
                <Bar key={p.projectId} dataKey={p.projectName} stackId="s" fill={colorForProject[p.projectId]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card title="Activity pattern (all time)">
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
                <Tooltip contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, fontSize: 12 }} formatter={(v) => `${v as number} files`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RPieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card title="Recent sessions">
          {recentSessions.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-500">No sessions in range</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-1.5 font-medium">Project</th>
                  <th className="py-1.5 font-medium">Started</th>
                  <th className="py-1.5 font-medium">Duration</th>
                  <th className="py-1.5 font-medium text-right">Commits</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s, i) => (
                  <tr key={i} className="border-t border-zinc-800/60">
                    <td className="py-1.5">
                      <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorForProject[s.projectId] }} />
                      <span className="ml-2">{s.projectName}</span>
                    </td>
                    <td className="py-1.5 text-zinc-400">{new Date(s.start).toLocaleString()}</td>
                    <td className="py-1.5 text-zinc-300">{formatDuration(s.durationMs)}</td>
                    <td className="py-1.5 text-right text-zinc-400">{s.commitCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-100 truncate" title={value}>{value}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 text-xs font-medium text-zinc-400">{title}</div>
      {children}
    </div>
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
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
                  className="m-px h-5 w-5 rounded-sm border border-zinc-900"
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
