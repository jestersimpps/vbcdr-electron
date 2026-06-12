import { useMemo } from 'react'
import { formatDuration, type Session } from '@/lib/sessions'
import { buildDayRows, formatDayLabel, formatHourMinute, type HistoryRange } from '@/lib/statistics-helpers'

interface DailyTimelineProps {
  sessions: Session[]
  range: HistoryRange
  colorForProject: Record<string, string>
  emptyColor: string
}

export function DailyTimeline({ sessions, range, colorForProject, emptyColor }: DailyTimelineProps): React.ReactElement {
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
          <div className="flex items-center pb-1 text-micro text-zinc-500">
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
                <div className="w-28 shrink-0 text-meta text-zinc-400">
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
                <div className="w-14 shrink-0 text-right text-meta tabular-nums text-zinc-300">
                  {formatDuration(row.totalMs)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {projectLegend.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-meta text-zinc-400">
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
