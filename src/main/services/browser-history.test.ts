import { describe, it, expect, beforeEach, vi } from 'vitest'

const stores = new Map<string, Record<string, unknown>>()

vi.mock('electron-store', () => {
  return {
    default: class MockStore<T extends Record<string, unknown>> {
      private name: string
      constructor(opts: { name?: string; defaults: T }) {
        this.name = opts.name ?? 'default'
        if (!stores.has(this.name)) {
          stores.set(this.name, { ...opts.defaults })
        }
      }
      get<K extends string>(key: K): unknown {
        return stores.get(this.name)![key]
      }
      set<K extends string>(key: K, val: unknown): void {
        stores.get(this.name)![key] = val
      }
    }
  }
})

const reset = (): void => {
  stores.clear()
  vi.resetModules()
}

describe('browser-history service', () => {
  beforeEach(reset)

  it('adds a new entry with normalized title', async () => {
    const { addHistoryEntry, getHistory } = await import('./browser-history')
    addHistoryEntry('p1', 'https://example.com', 'Example')
    const list = getHistory('p1')
    expect(list).toHaveLength(1)
    expect(list[0].url).toBe('https://example.com')
    expect(list[0].title).toBe('Example')
    expect(list[0].visitCount).toBe(1)
  })

  it('falls back to url when title is empty', async () => {
    const { addHistoryEntry, getHistory } = await import('./browser-history')
    addHistoryEntry('p1', 'https://example.com', '')
    expect(getHistory('p1')[0].title).toBe('https://example.com')
  })

  it('increments visitCount on duplicate URL', async () => {
    const { addHistoryEntry, getHistory } = await import('./browser-history')
    addHistoryEntry('p1', 'https://example.com', 'A')
    addHistoryEntry('p1', 'https://example.com', 'B')
    const list = getHistory('p1')
    expect(list).toHaveLength(1)
    expect(list[0].visitCount).toBe(2)
    expect(list[0].title).toBe('B')
  })

  it('does not overwrite title when new title is empty', async () => {
    const { addHistoryEntry, getHistory } = await import('./browser-history')
    addHistoryEntry('p1', 'https://example.com', 'Original')
    addHistoryEntry('p1', 'https://example.com', '')
    expect(getHistory('p1')[0].title).toBe('Original')
  })

  it('keeps history per-project isolated', async () => {
    const { addHistoryEntry, getHistory } = await import('./browser-history')
    addHistoryEntry('p1', 'https://a', 'A')
    addHistoryEntry('p2', 'https://b', 'B')
    expect(getHistory('p1').map((e) => e.url)).toEqual(['https://a'])
    expect(getHistory('p2').map((e) => e.url)).toEqual(['https://b'])
  })

  it('caps history at 500 entries (FIFO trimming oldest)', async () => {
    const { addHistoryEntry, getHistory } = await import('./browser-history')
    for (let i = 0; i < 510; i++) {
      addHistoryEntry('p1', `https://e${i}`, `E${i}`)
    }
    const list = getHistory('p1')
    expect(list).toHaveLength(500)
    expect(list[0].url).toBe('https://e509')
  })

  it('clearHistory removes a project entry only', async () => {
    const { addHistoryEntry, clearHistory, getHistory } = await import('./browser-history')
    addHistoryEntry('p1', 'https://a', 'A')
    addHistoryEntry('p2', 'https://b', 'B')
    clearHistory('p1')
    expect(getHistory('p1')).toEqual([])
    expect(getHistory('p2')).toHaveLength(1)
  })
})
