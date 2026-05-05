import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type ActivityKind = 'i' | 'o'

interface ActivityEvent {
  t: number
  k: ActivityKind
}

export interface ActivitySession {
  projectId: string
  start: number
  end: number
  durationMs: number
  inputCount: number
  outputCount: number
}

const RETENTION_DAYS = 90
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000
const FLUSH_DEBOUNCE_MS = 1500
const DEFAULT_IDLE_MINUTES = 5
const SESSION_TAIL_MS = 60_000
const PENDING_LINES_CAP = 10000

const pendingLines = new Map<string, string[]>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let compacted = false

interface ProjectEventsCache {
  events: ActivityEvent[]
  fileMtimeMs: number
}

const eventsCache = new Map<string, ProjectEventsCache>()
const dirtyProjects = new Set<string>()

function activityDir(): string {
  return path.join(app.getPath('userData'), 'activity')
}

function projectFile(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(activityDir(), `${safe}.jsonl`)
}

function ensureDir(): void {
  fs.mkdirSync(activityDir(), { recursive: true })
}

export function recordActivity(projectId: string, kind: ActivityKind): void {
  if (!projectId) return
  const line = JSON.stringify({ t: Date.now(), k: kind }) + '\n'
  let arr = pendingLines.get(projectId)
  if (!arr) {
    arr = []
    pendingLines.set(projectId, arr)
  }
  arr.push(line)
  if (arr.length > PENDING_LINES_CAP) {
    arr.splice(0, arr.length - PENDING_LINES_CAP)
  }
  dirtyProjects.add(projectId)
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushActivity()
  }, FLUSH_DEBOUNCE_MS)
}

export function flushActivity(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingLines.size === 0) return
  ensureDir()
  const flushed: string[] = []
  for (const [projectId, lines] of pendingLines) {
    if (lines.length === 0) {
      flushed.push(projectId)
      continue
    }
    try {
      fs.appendFileSync(projectFile(projectId), lines.join(''), 'utf-8')
      eventsCache.delete(projectId)
      flushed.push(projectId)
    } catch {
      /* keep pendingLines + dirty flag so the next flush retries */
    }
  }
  for (const projectId of flushed) {
    pendingLines.delete(projectId)
    dirtyProjects.delete(projectId)
  }
}

function loadProjectEvents(projectId: string): ActivityEvent[] {
  const file = projectFile(projectId)
  let mtime = 0
  try {
    mtime = fs.statSync(file).mtimeMs
  } catch {
    /* file may not exist */
  }
  const cached = eventsCache.get(projectId)
  if (cached && cached.fileMtimeMs === mtime && !dirtyProjects.has(projectId)) {
    return cached.events
  }
  const events: ActivityEvent[] = []
  if (mtime > 0) {
    try {
      const raw = fs.readFileSync(file, 'utf-8')
      const lines = raw.split('\n')
      for (const line of lines) {
        if (!line) continue
        try {
          const ev = JSON.parse(line) as ActivityEvent
          if (typeof ev.t !== 'number' || (ev.k !== 'i' && ev.k !== 'o')) continue
          events.push(ev)
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* file may not exist */
    }
  }
  eventsCache.set(projectId, { events, fileMtimeMs: mtime })
  return events
}

function readEvents(projectId: string, sinceMs: number | null): ActivityEvent[] {
  const base = loadProjectEvents(projectId)
  const pending = pendingLines.get(projectId) ?? []
  const out: ActivityEvent[] = []

  for (const ev of base) {
    if (sinceMs !== null && ev.t < sinceMs) continue
    out.push(ev)
  }

  for (const line of pending) {
    try {
      const ev = JSON.parse(line.trim()) as ActivityEvent
      if (typeof ev.t !== 'number' || (ev.k !== 'i' && ev.k !== 'o')) continue
      if (sinceMs !== null && ev.t < sinceMs) continue
      out.push(ev)
    } catch {
      /* skip */
    }
  }

  out.sort((a, b) => a.t - b.t)
  return out
}

function buildSessionsFromEvents(
  projectId: string,
  events: ActivityEvent[],
  idleMinutes: number
): ActivitySession[] {
  if (events.length === 0) return []
  const gapMs = idleMinutes * 60_000
  const sessions: ActivitySession[] = []

  let sStart = events[0].t
  let sEnd = events[0].t
  let inputCount = events[0].k === 'i' ? 1 : 0
  let outputCount = events[0].k === 'o' ? 1 : 0

  const flush = (): void => {
    const end = sEnd + SESSION_TAIL_MS
    sessions.push({
      projectId,
      start: sStart,
      end,
      durationMs: end - sStart,
      inputCount,
      outputCount
    })
  }

  for (let i = 1; i < events.length; i++) {
    const ev = events[i]
    if (ev.t - sEnd <= gapMs) {
      sEnd = ev.t
      if (ev.k === 'i') inputCount++
      else outputCount++
    } else {
      flush()
      sStart = ev.t
      sEnd = ev.t
      inputCount = ev.k === 'i' ? 1 : 0
      outputCount = ev.k === 'o' ? 1 : 0
    }
  }
  flush()

  return sessions
}

export function getSessions(
  projectId: string,
  sinceIso: string | null,
  idleMinutes: number = DEFAULT_IDLE_MINUTES
): ActivitySession[] {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null
  const events = readEvents(projectId, sinceMs)
  return buildSessionsFromEvents(projectId, events, idleMinutes)
}

export function getAllSessions(
  sinceIso: string | null,
  idleMinutes: number = DEFAULT_IDLE_MINUTES
): ActivitySession[] {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null
  const out: ActivitySession[] = []

  let entries: string[] = []
  try {
    entries = fs.readdirSync(activityDir())
  } catch {
    /* dir may not exist yet */
  }

  const seen = new Set<string>()
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue
    const projectId = name.slice(0, -'.jsonl'.length)
    seen.add(projectId)
    const events = readEvents(projectId, sinceMs)
    out.push(...buildSessionsFromEvents(projectId, events, idleMinutes))
  }

  for (const projectId of pendingLines.keys()) {
    if (seen.has(projectId)) continue
    const events = readEvents(projectId, sinceMs)
    out.push(...buildSessionsFromEvents(projectId, events, idleMinutes))
  }

  return out
}

export function purgeProjectActivity(projectId: string): void {
  if (!projectId) return
  pendingLines.delete(projectId)
  dirtyProjects.delete(projectId)
  eventsCache.delete(projectId)
  try {
    fs.unlinkSync(projectFile(projectId))
  } catch {
    /* file may not exist */
  }
}

export function compactActivity(): void {
  if (compacted) return
  let entries: string[] = []
  try {
    entries = fs.readdirSync(activityDir())
  } catch {
    return
  }
  compacted = true

  const cutoff = Date.now() - RETENTION_MS
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue
    const file = path.join(activityDir(), name)
    try {
      const raw = fs.readFileSync(file, 'utf-8')
      const lines = raw.split('\n')
      const kept: string[] = []
      for (const line of lines) {
        if (!line) continue
        try {
          const ev = JSON.parse(line) as ActivityEvent
          if (typeof ev.t !== 'number') continue
          if (ev.t >= cutoff) kept.push(line)
        } catch {
          /* skip */
        }
      }
      const projectId = name.slice(0, -'.jsonl'.length)
      if (kept.length === 0) {
        fs.unlinkSync(file)
        eventsCache.delete(projectId)
      } else if (kept.length !== lines.filter(Boolean).length) {
        fs.writeFileSync(file, kept.join('\n') + '\n', 'utf-8')
        eventsCache.delete(projectId)
      }
    } catch {
      /* ignore */
    }
  }
}
