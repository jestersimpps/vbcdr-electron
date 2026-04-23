import { getTerminalTheme } from '@/config/terminal-theme-registry'

export interface ChartPalette {
  colors: string[]
  axis: string
  grid: string
  tooltipBg: string
  tooltipBorder: string
  heatmapBase: string
  emptyCell: string
}

export function getChartPalette(themeId: string): ChartPalette {
  const t = getTerminalTheme(themeId)
  const colors = [
    t.blue,
    t.magenta,
    t.green,
    t.yellow,
    t.cyan,
    t.red,
    t.brightBlue,
    t.brightMagenta,
    t.brightGreen,
    t.brightYellow
  ].filter((c): c is string => typeof c === 'string' && c.length > 0)

  return {
    colors,
    axis: t.brightBlack ?? '#52525b',
    grid: t.brightBlack ?? '#27272a',
    tooltipBg: t.background ?? '#18181b',
    tooltipBorder: t.selectionBackground ?? t.brightBlack ?? '#27272a',
    heatmapBase: t.blue ?? '#60a5fa',
    emptyCell: t.black ?? '#18181b'
  }
}
