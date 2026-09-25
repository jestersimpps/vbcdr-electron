import { useEffect, useMemo, useState } from 'react'
import { Clock, GitCommit, Folder, Zap, Gauge, Bot, CalendarDays } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useThemeStore } from '@/stores/theme-store'
import { useLlmCapabilities } from '@/hooks/useLlmCapabilities'
import { Sparkline } from '@/components/terminal/Sparkline'
import { DailyTimeline } from '@/components/statistics/DailyTimeline'
import { getChartPalette } from '@/config/chart-palette'
import {
  buildSessions,
  mergeSessions,
  formatHours,
  rangeStartMs,
  type ProjectCommits
} from '@/lib/sessions'
import type { StatsCommit } from '@/models/types'
import { dayKeyOf } from '@/lib/activity-log'
import { formatTokens } from '@/lib/token-display'

const OVERVIEW_DAYS = 7
const SESSION_GAP_MINUTES = 30
const SESSION_LEAD_IN_MINUTES = 15

interface DailyUsageRow {
  date: string
  total: number
  perProject: Record<string, number>
}

interface TileProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}

function Tile({ icon, label, value, sub }: TileProps): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-r border-zinc-800/60 px-3 py-2 last:border-r-0">
      <div className="flex items-center gap-1 text-micro text-zinc-500">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate text-sm font-semibold tabular-nums text-zinc-100">{value}</div>
      {sub && <div className="truncate text-micro text-zinc-600">{sub}</div>}
    </div>
  )
}

export function DashboardOverview(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const tabs = useTerminalStore((s) => s.tabs)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const tokenCap = useLayoutStore((s) => s.tokenCap)
  const llmCapabilities = useLlmCapabilities()
  const themeId = useThemeStore((s) => s.getFullThemeId())
  const palette = useMemo(() => getChartPalette(themeId), [themeId])

  const [commits, setCommits] = useState<ProjectCommits[]>([])
  const [daily, setDaily] = useState<DailyUsageRow[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const sinceIso = new Date(Date.now() - OVERVIEW_DAYS * 86_400_000).toISOString()

      const [commitRows, usageRows] = await Promise.all([
        Promise.all(
          projects.map(async (p): Promise<ProjectCommits | null> => {
            try {
              if (!(await window.api.git.isRepo(p.path))) return null
              const [rows, userEmail] = await Promise.all([
                window.api.git.commitsSince(p.path, sinceIso) as Promise<StatsCommit[]>,
                window.api.git.userEmail(p.path) as Promise<string>
              ])
              return {
                projectId: p.id,
                projectName: p.name,
                commits: userEmail ? rows.filter((c) => c.authorEmail === userEmail) : rows
              }
            } catch {
              return null
            }
          })
        ),
        window.api.tokenUsage.daily(sinceIso).catch(() => []) as Promise<DailyUsageRow[]>
      ])

      if (cancelled) return
      setCommits(commitRows.filter((r): r is ProjectCommits => r !== null))
      setDaily(usageRows)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projects])

  const stats = useMemo(() => {
    const sessions = mergeSessions(
      buildSessions(commits, SESSION_GAP_MINUTES, SESSION_LEAD_IN_MINUTES)
    )
    const totalMs = sessions.reduce((n, s) => n + s.durationMs, 0)
    const commitCount = commits.reduce((n, p) => n + p.commits.length, 0)
    const activeProjects = commits.filter((p) => p.commits.length > 0).length
    const activeDays = new Set(
      commits.flatMap((p) => p.commits.map((c) => dayKeyOf(c.timestamp)))
    ).size

    const todayStart = rangeStartMs('today') ?? 0
    const todayMs = sessions
      .filter((s) => s.end >= todayStart)
      .reduce((n, s) => n + Math.max(s.end - Math.max(s.start, todayStart), 0), 0)

    return {
      sessions,
      totalMs,
      commitCount,
      activeProjects,
      activeDays,
      todayMs
    }
  }, [commits])

  const usage = useMemo(() => {
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
    const total = sorted.reduce((n, r) => n + r.total, 0)
    return { total, series: sorted.map((r) => r.total) }
  }, [daily])

  const tokenChart = useMemo(() => {
    const byId: Record<string, string> = {}
    for (const p of projects) byId[p.id] = p.name

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const rows: Array<Record<string, string | number>> = []
    const byDate = new Map(daily.map((r) => [r.date, r]))
    const active = new Set<string>()

    for (let i = OVERVIEW_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000)
      const key = dayKeyOf(d.getTime())
      const row: Record<string, string | number> = {
        label: d.toLocaleDateString(undefined, { weekday: 'short' })
      }
      const source = byDate.get(key)
      if (source) {
        for (const [projectId, tokens] of Object.entries(source.perProject)) {
          const name = byId[projectId]
          if (!name || tokens <= 0) continue
          row[name] = ((row[name] as number) ?? 0) + tokens
          active.add(projectId)
        }
      }
      rows.push(row)
    }

    const series = projects
      .filter((p) => active.has(p.id))
      .map((p) => ({ projectId: p.id, projectName: p.name }))

    return { rows, series }
  }, [daily, projects])

  const colorForProject = useMemo(() => {
    const map: Record<string, string> = {}
    const ids = projects.map((p) => p.id).sort()
    ids.forEach((id, i) => {
      map[id] = palette.colors[i % palette.colors.length]
    })
    return map
  }, [projects, palette])

  const timelineRange = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endOfToday = today.getTime() + 86_400_000 - 1
    return {
      start: today.getTime() - (OVERVIEW_DAYS - 1) * 86_400_000,
      end: endOfToday,
      windowEnd: endOfToday
    }
  }, [])

  const live = useMemo(() => {
    const llmTabs = tabs.filter((t) => t.initialCommand)
    const busy = llmTabs.filter((t) => tabStatuses[t.id] === 'busy').length
    const fillRatios = llmTabs.map((t) =>
      Math.min((tokenUsagePerTab[t.id] ?? 0) / tokenCap, 1)
    )
    const avgFill =
      fillRatios.length > 0
        ? fillRatios.reduce((n, r) => n + r, 0) / fillRatios.length
        : 0
    return {
      sessions: llmTabs.length,
      busy,
      pct: Math.round(avgFill * 100)
    }
  }, [tabs, tabStatuses, tokenUsagePerTab, tokenCap])

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-2 border-b border-zinc-800 sm:grid-cols-3 lg:grid-cols-6">
      <Tile
        icon={<CalendarDays size={9} />}
        label="Today"
        value={formatHours(stats.todayMs)}
        sub={stats.todayMs > 0 ? 'so far' : 'nothing yet'}
      />
      <Tile
        icon={<Clock size={9} />}
        label={`Coded ${OVERVIEW_DAYS}d`}
        value={formatHours(stats.totalMs)}
        sub={`${stats.activeDays} active day${stats.activeDays === 1 ? '' : 's'}`}
      />
      <Tile
        icon={<GitCommit size={9} />}
        label="Commits"
        value={String(stats.commitCount)}
        sub={`last ${OVERVIEW_DAYS} days`}
      />
      <Tile
        icon={<Folder size={9} />}
        label="Projects"
        value={`${stats.activeProjects}/${projects.length}`}
        sub="touched"
      />
      <Tile
        icon={<Bot size={9} />}
        label="Live sessions"
        value={String(live.sessions)}
        sub={live.busy > 0 ? `${live.busy} working` : 'idle'}
      />
      {llmCapabilities.usage ? (
        <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
          <div className="flex items-center gap-1 text-micro text-zinc-500">
            <Zap size={9} />
            <span className="truncate">Tokens {OVERVIEW_DAYS}d</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-zinc-100">
              {formatTokens(usage.total)}
            </span>
            {usage.series.length > 1 && (
              <span className="shrink-0 opacity-70">
                <Sparkline values={usage.series} width={48} height={12} color={palette.good} />
              </span>
            )}
          </div>
          <div className="truncate text-micro text-zinc-600">{live.pct}% context in use</div>
        </div>
      ) : (
        <Tile
          icon={<Gauge size={9} />}
          label="Context"
          value={`${live.pct}%`}
          sub="across live sessions"
        />
      )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-2">
        <DailyTimeline
          sessions={stats.sessions}
          range={timelineRange}
          colorForProject={colorForProject}
          emptyColor={palette.emptyCell}
          fallbackColor={palette.heatmapBase}
          showEmptyDays
        />

        {llmCapabilities.usage && tokenChart.series.length > 0 && (
          <div>
            <div className="mb-1 text-meta font-semibold uppercase tracking-wider text-zinc-500">
              Tokens per project
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={tokenChart.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" stroke={palette.axis} tick={{ fontSize: 10 }} />
                <YAxis
                  stroke={palette.axis}
                  tick={{ fontSize: 10 }}
                  width={44}
                  tickFormatter={(v) => formatTokens(v as number)}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
                  cursor={{ fill: palette.cursorFill }}
                  contentStyle={{
                    background: palette.tooltipBg,
                    border: `1px solid ${palette.tooltipBorder}`,
                    fontSize: 11
                  }}
                  formatter={(v) => formatTokens(v as number)}
                />
                {tokenChart.series.map((p) => (
                  <Bar
                    key={p.projectId}
                    dataKey={p.projectName}
                    stackId="tokens"
                    fill={colorForProject[p.projectId]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-meta text-zinc-400">
              {tokenChart.series.map((p) => (
                <div key={p.projectId} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: colorForProject[p.projectId] }}
                  />
                  <span>{p.projectName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
