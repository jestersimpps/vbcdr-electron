import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const MAX_BYTES = 128_000
const TRIM_HIGH_WATER = MAX_BYTES * 2
const FLUSH_DEBOUNCE_MS = 2000
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

const scrollbackDir = (): string => path.join(app.getPath('userData'), 'scrollback')

const chunks = new Map<string, string[]>()
const chunkSize = new Map<string, number>()
const dirty = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function ensureDir(): void {
  fs.mkdirSync(scrollbackDir(), { recursive: true })
}

function tabFile(tabId: string): string {
  return path.join(scrollbackDir(), `${tabId}.txt`)
}

export function loadScrollback(tabId: string): string {
  if (chunks.has(tabId)) {
    compactScrollback(tabId)
    return chunks.get(tabId)!.join('')
  }
  try {
    ensureDir()
    const data = fs.readFileSync(tabFile(tabId), 'utf-8')
    const trimmed = data.length > MAX_BYTES ? data.slice(-MAX_BYTES) : data
    chunks.set(tabId, [trimmed])
    chunkSize.set(tabId, trimmed.length)
    return trimmed
  } catch {
    return ''
  }
}

export function appendScrollback(tabId: string, chunk: string): void {
  if (!chunks.has(tabId)) {
    chunks.set(tabId, [])
    chunkSize.set(tabId, 0)
  }
  const arr = chunks.get(tabId)!
  arr.push(chunk)
  let total = (chunkSize.get(tabId) ?? 0) + chunk.length

  if (total > TRIM_HIGH_WATER) {
    const joined = arr.join('').slice(-MAX_BYTES)
    arr.length = 0
    arr.push(joined)
    total = joined.length
  }
  chunkSize.set(tabId, total)

  dirty.add(tabId)
  scheduleFlush()
}

export function compactScrollback(tabId: string): void {
  const arr = chunks.get(tabId)
  if (!arr) return
  const total = chunkSize.get(tabId) ?? 0
  if (total <= MAX_BYTES) return
  const joined = arr.join('').slice(-MAX_BYTES)
  arr.length = 0
  arr.push(joined)
  chunkSize.set(tabId, joined.length)
}

export function clearScrollback(tabId: string): void {
  chunks.delete(tabId)
  chunkSize.delete(tabId)
  dirty.delete(tabId)
  try { fs.unlinkSync(tabFile(tabId)) } catch { /* already gone */ }
}

/**
 * Deletes scrollback files that no longer belong to any tab.
 *
 * clearScrollback only runs from killPty, so a terminal that exits on its own -
 * a shell `exit`, a crash, the restart button - leaves its file behind, and tab
 * ids are fresh uuids that never recur. Without this the directory grows for the
 * life of the install.
 *
 * Age is the discriminator rather than liveness: a tab whose PTY died is still
 * in the renderer's persisted tab list and wants its scrollback for session
 * restore, so "no live PTY" would delete files that are about to be read. An
 * in-memory buffer means the tab is open right now, which is why those are
 * skipped regardless of the file's mtime.
 */
export function sweepScrollback(maxAgeMs: number = STALE_AFTER_MS): number {
  let names: string[]
  try {
    names = fs.readdirSync(scrollbackDir())
  } catch {
    return 0
  }
  const cutoff = Date.now() - maxAgeMs
  let removed = 0
  for (const name of names) {
    if (!name.endsWith('.txt')) continue
    const tabId = name.slice(0, -'.txt'.length)
    if (chunks.has(tabId)) continue
    const file = path.join(scrollbackDir(), name)
    try {
      if (fs.statSync(file).mtimeMs >= cutoff) continue
      fs.unlinkSync(file)
      removed++
    } catch {
      /* raced with another delete, or unreadable */
    }
  }
  return removed
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushScrollback()
  }, FLUSH_DEBOUNCE_MS)
}

export function flushScrollback(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (dirty.size === 0) return
  ensureDir()
  for (const tabId of dirty) {
    const arr = chunks.get(tabId)
    if (!arr || arr.length === 0) {
      try { fs.unlinkSync(tabFile(tabId)) } catch { /* ok */ }
      continue
    }
    const data = arr.join('')
    fs.writeFile(tabFile(tabId), data, 'utf-8', () => {/* fire and forget */})
  }
  dirty.clear()
}
