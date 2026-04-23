import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, BarChart3, Cpu, Gauge, History, Layers, Zap } from 'lucide-react'
import { useTerminalStore } from '@/stores/terminal-store'
import { useProjectStore } from '@/stores/project-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useTokenVelocity } from '@/hooks/useTokenVelocity'
import { Sparkline } from '@/components/terminal/Sparkline'
import { TIME_RANGES, rangeStartMs, type TimeRange } from '@/lib/sessions'
import { cn } from '@/lib/utils'

interface DailyUsageRow {
  date: string
  total: number
  perProject: Record<string, number>
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface TabRowProps {
  tabId: string
  title: string
  projectName: string
  tokens: number
  cap: number
  isBusy: boolean
}

function TabRow({ tabId, title, projectName, tokens, cap, isBusy }: TabRowProps): React.ReactElement {
  const { velocityPerSample, tokensPerMinute } = useTokenVelocity(tabId)
  const pct = Math.min(tokens / cap, 1)
  const fill = pct < 0.5 ? '#7ee787' : pct < 0.75 ? '#ffa657' : '#ff7b72'

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                isBusy ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'
              )}
            />
            <span className="truncate text-sm font-medium text-zinc-200" title={title}>
              {title}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500" title={projectName}>
            {projectName}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-zinc-500">Tokens</div>
          <div className="mt-0.5 font-medium text-zinc-200">{formatTokens(tokens)}</div>
          <div className="text-[10px] text-zinc-500">of {formatTokens(cap)}</div>
        </div>
        <div>
          <div className="text-zinc-500">Velocity</div>
          <div className="mt-0.5 font-medium text-zinc-200">{formatTokens(tokensPerMinute)}/min</div>
        </div>
        <div>
          <div className="text-zinc-500">Status</div>
          <div className={cn('mt-0.5 font-medium', isBusy ? 'text-amber-400' : 'text-emerald-400')}>
            {isBusy ? 'Working' : 'Idle'}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%`, backgroundColor: fill }}
          />
        </div>
        {velocityPerSample.length >= 2 && (
          <div className="mt-2 flex items-end justify-between">
            <div className="text-[10px] text-zinc-500">Last 60s velocity</div>
            <Sparkline values={velocityPerSample} width={140} height={28} color={fill} fillColor={`${fill}25`} />
          </div>
        )}
      </div>
    </div>
  )
}

export function Usage(): React.ReactElement {
  const tabs = useTerminalStore((s) => s.tabs)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const projects = useProjectStore((s) => s.projects)
  const tokenCap = useLayoutStore((s) => s.tokenCap)

  const [range, setRange] = useState<TimeRange['key']>('week')

  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const [dailyUsage, setDailyUsage] = useState<DailyUsageRow[]>([])
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const since = new Date()
      since.setDate(since.getDate() - 365)
      since.setHours(0, 0, 0, 0)
      const rows = (await window.api.tokenUsage.daily(since.toISOString())) as DailyUsageRow[]
      if (!cancelled) setDailyUsage(rows)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const projectNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of projects) map[p.id] = p.name
    return map
  }, [projects])

  const claudeTabs = useMemo(() => {
    return tabs
      .filter((t) => !!t.initialCommand)
      .map((t) => ({
        id: t.id,
        title: t.title || 'Claude',
        projectId: t.projectId,
        projectName: projectNameById[t.projectId] ?? '—',
        tokens: tokenUsagePerTab[t.id] ?? 0,
        isBusy: tabStatuses[t.id] === 'busy'
      }))
      .sort((a, b) => b.tokens - a.tokens)
  }, [tabs, tabStatuses, tokenUsagePerTab, projectNameById])

  const liveTotalTokens = useMemo(() => claudeTabs.reduce((acc, t) => acc + t.tokens, 0), [claudeTabs])
  const busyCount = useMemo(() => claudeTabs.filter((t) => t.isBusy).length, [claudeTabs])

  const rangeStartIso = useMemo(() => {
    const ms = rangeStartMs(range)
    return ms === null ? null : new Date(ms).toISOString().slice(0, 10)
  }, [range])

  const rangeRows = useMemo(() => {
    if (rangeStartIso === null) return dailyUsage
    return dailyUsage.filter((r) => r.date >= rangeStartIso)
  }, [dailyUsage, rangeStartIso])

  const periodTokens = useMemo(() => rangeRows.reduce((acc, r) => acc + r.total, 0), [rangeRows])
  const periodActiveDays = useMemo(() => rangeRows.filter((r) => r.total > 0).length, [rangeRows])

  const perProjectHistorical = useMemo(() => {
    const map: Record<string, { name: string; tokens: number }> = {}
    for (const r of rangeRows) {
      for (const [pid, t] of Object.entries(r.perProject)) {
        if (!map[pid]) map[pid] = { name: projectNameById[pid] ?? pid, tokens: 0 }
        map[pid].tokens += t
      }
    }
    return Object.values(map).sort((a, b) => b.tokens - a.tokens)
  }, [rangeRows, projectNameById])

  const maxProjectTokens = perProjectHistorical[0]?.tokens || 1
  const rangeLabel = TIME_RANGES.find((r) => r.key === range)?.label ?? ''

  return (
    <div className="min-h-full bg-zinc-950 p-6 text-zinc-200">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Usage</h1>
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
        </div>

        <Section title="Live">
          <div className="grid grid-cols-4 gap-3">
            <Kpi icon={<Layers size={14} />} label="Active sessions" value={String(claudeTabs.length)} />
            <Kpi icon={<Activity size={14} />} label="Currently working" value={String(busyCount)} />
            <Kpi icon={<Cpu size={14} />} label="Live tokens" value={formatTokens(liveTotalTokens)} />
            <Kpi
              icon={<History size={14} />}
              label={`${rangeLabel} tokens`}
              value={formatTokens(periodTokens)}
              sub={periodActiveDays > 0 ? `${periodActiveDays} active ${periodActiveDays === 1 ? 'day' : 'days'}` : undefined}
            />
          </div>

          {claudeTabs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 p-12 text-center">
              <Gauge size={28} className="mx-auto text-zinc-700" />
              <div className="mt-3 text-sm text-zinc-400">No active Claude sessions</div>
              <div className="mt-1 text-xs text-zinc-600">
                Open a Claude tab in any project to see live token usage and velocity here.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {claudeTabs.map((t) => (
                <TabRow
                  key={t.id}
                  tabId={t.id}
                  title={t.title}
                  projectName={t.projectName}
                  tokens={t.tokens}
                  cap={tokenCap}
                  isBusy={t.isBusy}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="History">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap size={13} className="text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-200">By project · {rangeLabel}</h2>
            </div>
            {perProjectHistorical.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-500">No token activity in range</div>
            ) : (
              <div className="space-y-2">
                {perProjectHistorical.map((p) => {
                  const widthPct = (p.tokens / maxProjectTokens) * 100
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-300">{p.name}</span>
                        <span className="tabular-nums text-zinc-400">{formatTokens(p.tokens)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-emerald-500/70"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <UsageChart range={range} rangeLabel={rangeLabel} />
        </Section>
      </div>
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

interface TokenEvent {
  t: number
  p: string
  d: number
}

interface UsageChartProps {
  range: TimeRange['key']
  rangeLabel: string
}

interface ChartBucket {
  label: string
  fullLabel: string
  start: number
  end: number
  total: number
}

function UsageChart({ range, rangeLabel }: UsageChartProps): React.ReactElement {
  const [events, setEvents] = useState<TokenEvent[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const startMs = rangeStartMs(range)
      const sinceIso = startMs === null ? null : new Date(startMs).toISOString()
      const ev = (await window.api.tokenUsage.events(sinceIso)) as TokenEvent[]
      if (!cancelled) setEvents(ev)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [range])

  const buckets = useMemo(() => buildBuckets(range), [range])

  const data = useMemo(() => {
    const out = buckets.map((b) => ({ ...b }))
    for (const ev of events) {
      const idx = findBucket(out, ev.t)
      if (idx === -1) continue
      out[idx].total += ev.d
    }
    return out
  }, [buckets, events])

  const total = useMemo(() => data.reduce((acc, b) => acc + b.total, 0), [data])
  const peak = useMemo(() => data.reduce((max, b) => Math.max(max, b.total), 0), [data])

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className="text-zinc-400" />
          <h2 className="text-sm font-medium text-zinc-200">Tokens over time · {rangeLabel}</h2>
        </div>
        <div className="text-xs text-zinc-500">
          Peak {formatTokens(peak)} • Total {formatTokens(total)}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ee787" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#7ee787" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="label"
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => formatTokens(v as number)}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              fontSize: 12,
              borderRadius: 6
            }}
            labelFormatter={(_, payload) => {
              if (payload && payload.length > 0) {
                const item = payload[0].payload as ChartBucket
                return item.fullLabel
              }
              return ''
            }}
            formatter={(value) => [`${formatTokens(value as number)} tokens`, 'Tokens']}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#7ee787"
            strokeWidth={1.5}
            fill="url(#usageFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function buildBuckets(range: TimeRange['key']): ChartBucket[] {
  const now = new Date()
  const buckets: ChartBucket[] = []

  if (range === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    for (let h = 0; h < 24; h++) {
      const s = new Date(start)
      s.setHours(h)
      const e = new Date(s)
      e.setHours(h + 1)
      buckets.push({
        label: `${h}:00`,
        fullLabel: `${s.toLocaleDateString()} ${h}:00–${h + 1}:00`,
        start: s.getTime(),
        end: e.getTime(),
        total: 0
      })
    }
    return buckets
  }

  if (range === 'week' || range === 'month') {
    const startMs = rangeStartMs(range) as number
    const start = new Date(startMs)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    const cursor = new Date(start)
    while (cursor.getTime() <= end.getTime()) {
      const s = new Date(cursor)
      const e = new Date(cursor)
      e.setDate(e.getDate() + 1)
      buckets.push({
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        fullLabel: cursor.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        start: s.getTime(),
        end: e.getTime(),
        total: 0
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return buckets
  }

  if (range === 'ytd') {
    const startMs = rangeStartMs(range) as number
    const cursor = new Date(startMs)
    const dow = (cursor.getDay() + 6) % 7
    cursor.setDate(cursor.getDate() - dow)
    const end = new Date(now)
    while (cursor.getTime() <= end.getTime()) {
      const s = new Date(cursor)
      const e = new Date(cursor)
      e.setDate(e.getDate() + 7)
      buckets.push({
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        fullLabel: `Week of ${cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        start: s.getTime(),
        end: e.getTime(),
        total: 0
      })
      cursor.setDate(cursor.getDate() + 7)
    }
    return buckets
  }

  const lookbackMonths = 12
  const cursor = new Date(now)
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  cursor.setMonth(cursor.getMonth() - (lookbackMonths - 1))
  for (let i = 0; i < lookbackMonths; i++) {
    const s = new Date(cursor)
    const e = new Date(cursor)
    e.setMonth(e.getMonth() + 1)
    buckets.push({
      label: cursor.toLocaleString(undefined, { month: 'short' }),
      fullLabel: cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
      start: s.getTime(),
      end: e.getTime(),
      total: 0
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets
}

function findBucket(buckets: ChartBucket[], t: number): number {
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start && t < buckets[i].end) return i
  }
  return -1
}

interface KpiProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}

function Kpi({ icon, label, value, sub }: KpiProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-100">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-500">{sub}</div>}
    </div>
  )
}
