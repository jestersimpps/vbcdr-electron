import { hexToRgb } from '@/lib/statistics-helpers'

export function Heatmap({ grid, max, baseColor, emptyColor }: { grid: number[][]; max: number; baseColor: string; emptyColor: string }): React.ReactElement {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const [r, g, b] = hexToRgb(baseColor)
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex text-micro text-zinc-500">
          <div className="w-8" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-5 text-center">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {grid.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center">
            <div className="w-8 text-micro text-zinc-500">{days[dayIdx]}</div>
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
