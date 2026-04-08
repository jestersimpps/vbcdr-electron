import Store from 'electron-store'

interface ScrollbackSchema {
  buffers: Record<string, string>
}

const MAX_BYTES = 256_000
const FLUSH_DEBOUNCE_MS = 1500

const store = new Store<ScrollbackSchema>({
  name: 'terminal-scrollback',
  defaults: { buffers: {} }
})

const memory = new Map<string, string>()
const dirty = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function loadScrollback(tabId: string): string {
  const cached = memory.get(tabId)
  if (cached !== undefined) return cached
  const all = store.get('buffers')
  const data = all[tabId] ?? ''
  memory.set(tabId, data)
  return data
}

export function appendScrollback(tabId: string, chunk: string): void {
  const current = memory.get(tabId) ?? loadScrollback(tabId)
  let next = current + chunk
  if (next.length > MAX_BYTES) {
    next = next.slice(next.length - MAX_BYTES)
  }
  memory.set(tabId, next)
  dirty.add(tabId)
  scheduleFlush()
}

export function clearScrollback(tabId: string): void {
  memory.delete(tabId)
  dirty.delete(tabId)
  const all = store.get('buffers')
  if (tabId in all) {
    delete all[tabId]
    store.set('buffers', all)
  }
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
  const all = store.get('buffers')
  for (const tabId of dirty) {
    const data = memory.get(tabId)
    if (data && data.length > 0) {
      all[tabId] = data
    } else {
      delete all[tabId]
    }
  }
  store.set('buffers', all)
  dirty.clear()
}
