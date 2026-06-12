import { hexToRgb, type HistoryCalendarData } from '@/lib/statistics-helpers'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function YearHeatmap({
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
        <div className="flex h-3 text-micro text-zinc-500">
          <div className="w-8 shrink-0" />
          {monthRow.map((label, i) => (
            <div key={i} className="relative w-[14px] shrink-0">
              {label && <span className="absolute left-0 top-0 whitespace-nowrap">{label}</span>}
            </div>
          ))}
        </div>
        {days.map((day, dayIdx) => (
          <div key={day} className="flex items-center">
            <div className="w-8 text-micro text-zinc-500">{dayIdx % 2 === 0 ? day : ''}</div>
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
