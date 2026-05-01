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
      get(key: string): unknown {
        return stores.get(this.name)![key]
      }
      set(key: string, val: unknown): void {
        stores.get(this.name)![key] = val
      }
    }
  }
})

const reset = (): void => {
  stores.clear()
  vi.resetModules()
}

describe('browser-bookmarks service', () => {
  beforeEach(reset)

  it('adds a bookmark with id, url, title, createdAt', async () => {
    const { addBookmark, getBookmarks } = await import('./browser-bookmarks')
    const bm = addBookmark('p1', 'https://example.com', 'Ex')
    expect(bm.id).toBeTruthy()
    expect(bm.url).toBe('https://example.com')
    expect(bm.title).toBe('Ex')
    expect(typeof bm.createdAt).toBe('number')
    expect(getBookmarks('p1')).toHaveLength(1)
  })

  it('keeps bookmarks per-project isolated', async () => {
    const { addBookmark, getBookmarks } = await import('./browser-bookmarks')
    addBookmark('p1', 'https://a', 'A')
    addBookmark('p2', 'https://b', 'B')
    expect(getBookmarks('p1').map((b) => b.url)).toEqual(['https://a'])
    expect(getBookmarks('p2').map((b) => b.url)).toEqual(['https://b'])
  })

  it('removes only the matching bookmark', async () => {
    const { addBookmark, removeBookmark, getBookmarks } = await import('./browser-bookmarks')
    const a = addBookmark('p1', 'https://a', 'A')
    addBookmark('p1', 'https://b', 'B')
    removeBookmark('p1', a.id)
    expect(getBookmarks('p1').map((b) => b.url)).toEqual(['https://b'])
  })

  it('removeBookmark on unknown id is a no-op', async () => {
    const { addBookmark, removeBookmark, getBookmarks } = await import('./browser-bookmarks')
    addBookmark('p1', 'https://a', 'A')
    removeBookmark('p1', 'unknown')
    expect(getBookmarks('p1')).toHaveLength(1)
  })
})
