interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
  fillColor?: string
}

export function Sparkline({
  values,
  width = 60,
  height = 14,
  color = '#7ee787',
  fillColor
}: SparklineProps): React.ReactElement | null {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const linePath = `M ${points.join(' L ')}`
  const fillPath = `${linePath} L ${width.toFixed(2)},${height} L 0,${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      preserveAspectRatio="none"
    >
      {fillColor && <path d={fillPath} fill={fillColor} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
