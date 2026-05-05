import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const MAX_BYTES = 128_000
const TRIM_HIGH_WATER = MAX_BYTES * 2
const FLUSH_DEBOUNCE_MS = 2000

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
