import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface TokenEvent {
  t: number
  p: string
  d: number
}

export interface DailyTokenUsage {
  date: string
  total: number
  perProject: Record<string, number>
}

const RETENTION_DAYS = 365
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000
const FLUSH_DEBOUNCE_MS = 1500
const COMPACT_INTERVAL_MS = 24 * 60 * 60 * 1000

const pendingLines: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastCompactAt = 0

let eventsCache: TokenEvent[] | null = null

const lastTokensByTab = new Map<string, number>()

function tokenDir(): string {
  return path.join(app.getPath('userData'), 'token-usage')
}

function tokenFile(): string {
  return path.join(tokenDir(), 'events.jsonl')
}

function ensureDir(): void {
  fs.mkdirSync(tokenDir(), { recursive: true })
}

export function recordTokenSnapshot(tabId: string, projectId: string, tokens: number): void {
  if (!projectId || !tabId || !Number.isFinite(tokens) || tokens < 0) return
  const prev = lastTokensByTab.get(tabId) ?? 0
  const delta = tokens - prev
  lastTokensByTab.set(tabId, tokens)
  if (delta <= 0) return
  const ev: TokenEvent = { t: Date.now(), p: projectId, d: delta }
  pendingLines.push(JSON.stringify(ev) + '\n')
  if (eventsCache) eventsCache.push(ev)
  scheduleFlush()
}

export function resetTabTokenTracking(tabId: string): void {
  lastTokensByTab.delete(tabId)
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushTokenUsage()
  }, FLUSH_DEBOUNCE_MS)
}

export function flushTokenUsage(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingLines.length === 0) return
  ensureDir()
  try {
    fs.appendFileSync(tokenFile(), pendingLines.join(''), 'utf-8')
    pendingLines.length = 0
  } catch {
    /* ignore write errors */
  }
}

function loadEventsCache(): TokenEvent[] {
  if (eventsCache) return eventsCache
  const events: TokenEvent[] = []
  try {
    const raw = fs.readFileSync(tokenFile(), 'utf-8')
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line) continue
      try {
        const ev = JSON.parse(line) as TokenEvent
        if (typeof ev.t !== 'number' || typeof ev.d !== 'number' || typeof ev.p !== 'string') continue
        events.push(ev)
      } catch {
        /* skip */
      }
    }
  } catch {
    /* file may not exist */
  }
  eventsCache = events
  return events
}

function readEvents(sinceMs: number | null): TokenEvent[] {
  const cached = loadEventsCache()
  if (sinceMs === null) return cached.slice()
  const out: TokenEvent[] = []
  for (const ev of cached) {
    if (ev.t >= sinceMs) out.push(ev)
  }
  return out
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getEvents(sinceIso: string | null): TokenEvent[] {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null
  return readEvents(sinceMs)
}

export function getDailyUsage(sinceIso: string | null): DailyTokenUsage[] {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null
  const events = readEvents(sinceMs)
  const byDate = new Map<string, DailyTokenUsage>()
  for (const ev of events) {
    const date = formatDate(new Date(ev.t))
    let row = byDate.get(date)
    if (!row) {
      row = { date, total: 0, perProject: {} }
      byDate.set(date, row)
    }
    row.total += ev.d
    row.perProject[ev.p] = (row.perProject[ev.p] ?? 0) + ev.d
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function compactTokenUsage(): void {
  const now = Date.now()
  if (now - lastCompactAt < COMPACT_INTERVAL_MS) return
  lastCompactAt = now
  const cutoff = now - RETENTION_MS
  try {
    const raw = fs.readFileSync(tokenFile(), 'utf-8')
    const lines = raw.split('\n')
    const kept: string[] = []
    for (const line of lines) {
      if (!line) continue
      try {
        const ev = JSON.parse(line) as TokenEvent
        if (typeof ev.t !== 'number') continue
        if (ev.t >= cutoff) kept.push(line)
      } catch {
        /* skip */
      }
    }
    const originalCount = lines.filter(Boolean).length
    if (kept.length === 0) {
      fs.unlinkSync(tokenFile())
      eventsCache = []
    } else if (kept.length !== originalCount) {
      fs.writeFileSync(tokenFile(), kept.join('\n') + '\n', 'utf-8')
      eventsCache = null
    }
  } catch {
    /* file may not exist */
  }
}
