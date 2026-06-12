import type { Session } from '@/lib/sessions'
import type { StatsCommit } from '@/models/types'

export type HistoryWindow = 'today' | 'week' | 'month' | 'year' | 'custom'
export type HistoryMetric = 'hours' | 'commits'
export type HistoryView = 'heatmap' | 'timeline'

export interface HistoryRange {
  start: number
  end: number
  windowEnd: number
}

export function parseDateInput(value: string): number | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d, 0, 0, 0, 0)
  if (isNaN(date.getTime())) return null
  return date.getTime()
}

export function formatDateInput(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function historyRange(w: HistoryWindow, customFromMs: number | null, customToMs: number | null): HistoryRange {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const endOfToday = today.getTime() + 86_400_000 - 1
  if (w === 'custom') {
    const start = customFromMs ?? today.getTime()
    const endDay = customToMs ?? today.getTime()
    const end = Math.min(endDay + 86_400_000 - 1, Date.now())
    return { start: Math.min(start, end), end, windowEnd: endDay + 86_400_000 - 1 }
  }
  if (w === 'today') return { start: today.getTime(), end: endOfToday, windowEnd: endOfToday }
  if (w === 'week') {
    const d = new Date(today)
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    const weekEnd = new Date(d)
    weekEnd.setDate(weekEnd.getDate() + 7)
    return { start: d.getTime(), end: endOfToday, windowEnd: weekEnd.getTime() - 1 }
  }
  if (w === 'month') {
    const d = new Date(today)
    d.setDate(1)
    const monthEnd = new Date(d)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    return { start: d.getTime(), end: endOfToday, windowEnd: monthEnd.getTime() - 1 }
  }
  const d = new Date(today)
  d.setMonth(0, 1)
  const yearEnd = new Date(d)
  yearEnd.setFullYear(yearEnd.getFullYear() + 1)
  return { start: d.getTime(), end: endOfToday, windowEnd: yearEnd.getTime() - 1 }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export interface HistoryCalendarCell {
  dateMs: number
  hours: number
  commits: number
  topProjectName: string | null
  topProjectMs: number
}

export interface HistoryCalendarData {
  weeks: HistoryCalendarCell[][]
  max: number
  metric: HistoryMetric
  startMs: number
  endMs: number
  windowEndMs: number
}

function startOfWeekMs(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDaysMs(ms: number, days: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function buildHistoryCalendar({
  startMs,
  endMs,
  sessions,
  commits,
  metric,
  windowEndMs
}: {
  startMs: number
  endMs: number
  windowEndMs: number
  sessions: Session[]
  commits: StatsCommit[]
  metric: HistoryMetric
}): HistoryCalendarData {
  const weekStart = startOfWeekMs(startMs)
  const hoursPerDay = new Map<number, number>()
  const commitsPerDay = new Map<number, number>()
  const projectMsPerDay = new Map<number, Map<string, number>>()

  for (const s of sessions) {
    const segStart = Math.max(s.start, weekStart)
    const segEnd = Math.min(s.end, endMs)
    if (segEnd <= segStart) continue
    let cursor = startOfDayMs(segStart)
    while (cursor <= segEnd) {
      const dayEnd = addDaysMs(cursor, 1)
      const overlap = Math.min(segEnd, dayEnd) - Math.max(segStart, cursor)
      if (overlap > 0) {
        hoursPerDay.set(cursor, (hoursPerDay.get(cursor) ?? 0) + overlap / 3_600_000)
        let perProject = projectMsPerDay.get(cursor)
        if (!perProject) {
          perProject = new Map<string, number>()
          projectMsPerDay.set(cursor, perProject)
        }
        perProject.set(s.projectName, (perProject.get(s.projectName) ?? 0) + overlap)
      }
      cursor = dayEnd
    }
  }

  for (const c of commits) {
    if (c.timestamp < weekStart || c.timestamp > endMs) continue
    const day = startOfDayMs(c.timestamp)
    commitsPerDay.set(day, (commitsPerDay.get(day) ?? 0) + 1)
  }

  const weeks: HistoryCalendarCell[][] = []
  let max = 0.0001
  let weekCursor = weekStart
  while (weekCursor <= windowEndMs) {
    const week: HistoryCalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const dayMs = addDaysMs(weekCursor, d)
      const hours = hoursPerDay.get(dayMs) ?? 0
      const commitCount = commitsPerDay.get(dayMs) ?? 0
      let topProjectName: string | null = null
      let topProjectMs = 0
      const perProject = projectMsPerDay.get(dayMs)
      if (perProject) {
        perProject.forEach((ms, name) => {
          if (ms > topProjectMs) {
            topProjectMs = ms
            topProjectName = name
          }
        })
      }
      const value = metric === 'hours' ? hours : commitCount
      if (value > max) max = value
      week.push({ dateMs: dayMs, hours, commits: commitCount, topProjectName, topProjectMs })
    }
    weeks.push(week)
    weekCursor = addDaysMs(weekCursor, 7)
  }
  return { weeks, max, metric, startMs: weekStart, endMs, windowEndMs }
}

export interface HistoryStats {
  totalHours: number
  totalCommits: number
  activeDays: number
  possibleDays: number
  currentStreak: number
  longestStreak: number
}

export function computeHistoryStats(calendar: HistoryCalendarData): HistoryStats {
  const now = Date.now()
  let totalHours = 0
  let totalCommits = 0
  let activeDays = 0
  let possibleDays = 0
  let longestStreak = 0
  let currentStreak = 0
  let runningStreak = 0
  const today = startOfDayMs(now)
  const dayValues: { dateMs: number; active: boolean }[] = []
  for (const week of calendar.weeks) {
    for (const cell of week) {
      if (cell.dateMs > calendar.windowEndMs) continue
      if (cell.dateMs < calendar.startMs) continue
      possibleDays += 1
      if (cell.dateMs > now) continue
      totalHours += cell.hours
      totalCommits += cell.commits
      const active = calendar.metric === 'hours' ? cell.hours > 0 : cell.commits > 0
      if (active) activeDays += 1
      dayValues.push({ dateMs: cell.dateMs, active })
    }
  }
  dayValues.sort((a, b) => a.dateMs - b.dateMs)
  for (const d of dayValues) {
    if (d.active) {
      runningStreak += 1
      if (runningStreak > longestStreak) longestStreak = runningStreak
    } else {
      runningStreak = 0
    }
  }
  for (let i = dayValues.length - 1; i >= 0; i--) {
    const d = dayValues[i]
    if (d.dateMs === today && !d.active) continue
    if (d.active) currentStreak += 1
    else break
  }
  return { totalHours, totalCommits, activeDays, possibleDays, currentStreak, longestStreak }
}

export interface DayBlock {
  projectId: string
  projectName: string
  startHour: number
  endHour: number
  start: number
  end: number
  durationMs: number
}

export interface DayRow {
  dateMs: number
  blocks: DayBlock[]
  totalMs: number
  byProject: Map<string, number>
}

export function buildDayRows(sessions: Session[], range: HistoryRange): DayRow[] {
  const byDay = new Map<number, DayRow>()
  const ensureDay = (dayMs: number): DayRow => {
    let row = byDay.get(dayMs)
    if (!row) {
      row = { dateMs: dayMs, blocks: [], totalMs: 0, byProject: new Map() }
      byDay.set(dayMs, row)
    }
    return row
  }
  for (const s of sessions) {
    const segStart = Math.max(s.start, range.start)
    const segEnd = Math.min(s.end, range.end)
    if (segEnd <= segStart) continue
    let cursor = startOfDayMs(segStart)
    while (cursor <= segEnd) {
      const dayEnd = addDaysMs(cursor, 1)
      const blockStart = Math.max(segStart, cursor)
      const blockEnd = Math.min(segEnd, dayEnd)
      if (blockEnd > blockStart) {
        const row = ensureDay(cursor)
        const startHour = (blockStart - cursor) / 3_600_000
        const endHour = (blockEnd - cursor) / 3_600_000
        const dur = blockEnd - blockStart
        row.blocks.push({
          projectId: s.projectId,
          projectName: s.projectName,
          startHour,
          endHour,
          start: blockStart,
          end: blockEnd,
          durationMs: dur
        })
        row.totalMs += dur
        row.byProject.set(s.projectId, (row.byProject.get(s.projectId) ?? 0) + dur)
      }
      cursor = dayEnd
    }
  }
  const rows = Array.from(byDay.values())
  rows.sort((a, b) => b.dateMs - a.dateMs)
  for (const r of rows) r.blocks.sort((a, b) => a.startHour - b.startHour)
  return rows
}

export function formatDayLabel(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatHourMinute(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export interface Bucket {
  label: string
  start: number
  end: number
}

export function buildBuckets(startMs: number, endMs: number, range: string): Bucket[] {
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

export function bucketIndicesFor(s: Session, buckets: Bucket[]): number[] {
  const out: number[] = []
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].end <= s.start) continue
    if (buckets[i].start >= s.end) break
    out.push(i)
  }
  return out
}
