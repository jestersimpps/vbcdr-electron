import { getTerminalTheme } from '@/config/terminal-theme-registry'

export type BarRadius = number | [number, number, number, number]

export interface ChartStyle {
  barRadius: BarRadius
  gridDash: string | undefined
  gridOpacity: number
  areaTopOpacity: number
  areaBottomOpacity: number
  cursorFill: string
  pieGap: number
  pieStroke: string | undefined
}

export interface ChartPalette extends ChartStyle {
  colors: string[]
  axis: string
  grid: string
  tooltipBg: string
  tooltipBorder: string
  heatmapBase: string
  emptyCell: string
  good: string
  warn: string
  bad: string
}

const DEFAULT_CHART_STYLE: ChartStyle = {
  barRadius: [0, 4, 4, 0],
  gridDash: '3 3',
  gridOpacity: 1,
  areaTopOpacity: 0.5,
  areaBottomOpacity: 0.05,
  cursorFill: 'rgba(255,255,255,0.04)',
  pieGap: 2,
  pieStroke: undefined
}

const TELETEXT_CHART_STYLE: Omit<ChartStyle, 'cursorFill' | 'pieStroke'> = {
  barRadius: 0,
  gridDash: undefined,
  gridOpacity: 0.35,
  areaTopOpacity: 0.35,
  areaBottomOpacity: 0.35,
  pieGap: 0
}

const CHART_OVERRIDES: Record<string, Partial<ChartPalette>> = {
  'vbcdr-dark': { ...TELETEXT_CHART_STYLE, cursorFill: 'rgba(31,60,255,0.25)', pieStroke: '#000000', emptyCell: '#060c33' },
  'vbcdr-light': { ...TELETEXT_CHART_STYLE, cursorFill: 'rgba(31,60,255,0.12)', pieStroke: '#ffffff', emptyCell: '#eef0ff' }
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
    ...DEFAULT_CHART_STYLE,
    colors,
    axis: t.foreground ?? '#a1a1aa',
    grid: t.brightBlack ?? '#27272a',
    tooltipBg: t.background ?? '#18181b',
    tooltipBorder: t.selectionBackground ?? t.brightBlack ?? '#27272a',
    heatmapBase: t.blue ?? '#60a5fa',
    emptyCell: t.black ?? '#18181b',
    good: t.green ?? '#7ee787',
    warn: t.yellow ?? '#ffa657',
    bad: t.red ?? '#ff7b72',
    ...CHART_OVERRIDES[themeId]
  }
}
