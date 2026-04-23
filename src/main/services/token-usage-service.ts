import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface TokenEvent {
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

const pendingLines: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let compacted = false

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

function readEvents(sinceMs: number | null): TokenEvent[] {
  const events: TokenEvent[] = []
  try {
    const raw = fs.readFileSync(tokenFile(), 'utf-8')
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line) continue
      try {
        const ev = JSON.parse(line) as TokenEvent
        if (typeof ev.t !== 'number' || typeof ev.d !== 'number' || typeof ev.p !== 'string') continue
        if (sinceMs !== null && ev.t < sinceMs) continue
        events.push(ev)
      } catch {
        /* skip */
      }
    }
  } catch {
    /* file may not exist */
  }
  for (const line of pendingLines) {
    try {
      const ev = JSON.parse(line.trim()) as TokenEvent
      if (typeof ev.t !== 'number' || typeof ev.d !== 'number' || typeof ev.p !== 'string') continue
      if (sinceMs !== null && ev.t < sinceMs) continue
      events.push(ev)
    } catch {
      /* skip */
    }
  }
  return events
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface TokenEventOut {
  t: number
  projectId: string
  delta: number
}

export function getEvents(sinceIso: string | null): TokenEventOut[] {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null
  const events = readEvents(sinceMs)
  return events.map((e) => ({ t: e.t, projectId: e.p, delta: e.d }))
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
  if (compacted) return
  compacted = true
  const cutoff = Date.now() - RETENTION_MS
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
    if (kept.length === 0) {
      fs.unlinkSync(tokenFile())
    } else if (kept.length !== lines.filter(Boolean).length) {
      fs.writeFileSync(tokenFile(), kept.join('\n') + '\n', 'utf-8')
    }
  } catch {
    /* file may not exist */
  }
}
