import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

let scrollbackRoot = ''

vi.mock('electron', () => ({
  app: {
    getPath: (_key: string) => scrollbackRoot
  }
}))

async function importFresh(): Promise<typeof import('./terminal-scrollback')> {
  vi.resetModules()
  return import('./terminal-scrollback')
}

describe('terminal-scrollback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    scrollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scrollback-'))
  })

  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(scrollbackRoot, { recursive: true, force: true })
  })

  it('returns empty string for an unknown tab with no file on disk', async () => {
    const mod = await importFresh()
    expect(mod.loadScrollback('missing')).toBe('')
  })

  it('appends chunks to the in-memory buffer and returns the joined value', async () => {
    const mod = await importFresh()
    mod.appendScrollback('t1', 'hello ')
    mod.appendScrollback('t1', 'world')
    expect(mod.loadScrollback('t1')).toBe('hello world')
  })

  it('caps the buffer at 128_000 bytes by keeping the tail', async () => {
    const mod = await importFresh()
    const chunkA = 'A'.repeat(80_000)
    const chunkB = 'B'.repeat(80_000)
    mod.appendScrollback('big', chunkA)
    mod.appendScrollback('big', chunkB)

    const result = mod.loadScrollback('big')
    expect(result.length).toBe(128_000)
    expect(result.endsWith('B'.repeat(80_000))).toBe(true)
    expect(result.startsWith('A'.repeat(48_000))).toBe(true)
  })

  it('flushes the buffer to disk after the debounce window', async () => {
    const mod = await importFresh()
    mod.appendScrollback('disk-tab', 'persisted text')

    const filePath = path.join(scrollbackRoot, 'scrollback', 'disk-tab.txt')
    expect(fs.existsSync(filePath)).toBe(false)

    vi.advanceTimersByTime(2000)
    await vi.waitFor(() => {
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('persisted text')
    })
  })

  it('flushScrollback() flushes immediately and cancels the pending timer', async () => {
    const mod = await importFresh()
    mod.appendScrollback('immediate', 'now')
    mod.flushScrollback()

    const filePath = path.join(scrollbackRoot, 'scrollback', 'immediate.txt')
    await vi.waitFor(() => {
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('now')
    })
  })

  it('flushScrollback() is a no-op when nothing is dirty', async () => {
    const mod = await importFresh()
    expect(() => mod.flushScrollback()).not.toThrow()
    expect(fs.existsSync(path.join(scrollbackRoot, 'scrollback'))).toBe(false)
  })

  it('loadScrollback() reads from disk on first access for an unknown tab', async () => {
    const dir = path.join(scrollbackRoot, 'scrollback')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'from-disk.txt'), 'restored')

    const mod = await importFresh()
    expect(mod.loadScrollback('from-disk')).toBe('restored')

    mod.appendScrollback('from-disk', '!')
    expect(mod.loadScrollback('from-disk')).toBe('restored!')
  })

  it('clearScrollback() drops in-memory state and removes the on-disk file', async () => {
    const mod = await importFresh()
    mod.appendScrollback('clear-me', 'data')
    mod.flushScrollback()

    const filePath = path.join(scrollbackRoot, 'scrollback', 'clear-me.txt')
    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(true))

    mod.clearScrollback('clear-me')
    expect(fs.existsSync(filePath)).toBe(false)
    expect(mod.loadScrollback('clear-me')).toBe('')
  })

  it('clearScrollback() is safe to call on an unknown tab', async () => {
    const mod = await importFresh()
    expect(() => mod.clearScrollback('never-existed')).not.toThrow()
  })

  describe('sweepScrollback', () => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000

    const writeAged = (tabId: string, ageMs: number): string => {
      const dir = path.join(scrollbackRoot, 'scrollback')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `${tabId}.txt`)
      fs.writeFileSync(file, 'old output')
      const when = new Date(Date.now() - ageMs)
      fs.utimesSync(file, when, when)
      return file
    }

    it('removes files older than the stale window', async () => {
      const mod = await importFresh()
      const file = writeAged('long-gone', WEEK_MS + 60_000)

      expect(mod.sweepScrollback()).toBe(1)
      expect(fs.existsSync(file)).toBe(false)
    })

    it('keeps files inside the stale window', async () => {
      const mod = await importFresh()
      const file = writeAged('recent', 60_000)

      expect(mod.sweepScrollback()).toBe(0)
      expect(fs.existsSync(file)).toBe(true)
    })

    it('keeps an open tab even when its file is old', async () => {
      const mod = await importFresh()
      const file = writeAged('still-open', WEEK_MS + 60_000)
      // An in-memory buffer means the terminal is live right now.
      mod.appendScrollback('still-open', 'live output')

      expect(mod.sweepScrollback()).toBe(0)
      expect(fs.existsSync(file)).toBe(true)
    })

    it('honours an explicit max age', async () => {
      const mod = await importFresh()
      const file = writeAged('hour-old', 60 * 60 * 1000)

      expect(mod.sweepScrollback(30 * 60 * 1000)).toBe(1)
      expect(fs.existsSync(file)).toBe(false)
    })

    it('ignores non-scrollback files', async () => {
      const mod = await importFresh()
      const dir = path.join(scrollbackRoot, 'scrollback')
      fs.mkdirSync(dir, { recursive: true })
      const stray = path.join(dir, 'notes.md')
      fs.writeFileSync(stray, 'not scrollback')
      const when = new Date(Date.now() - (WEEK_MS + 60_000))
      fs.utimesSync(stray, when, when)

      expect(mod.sweepScrollback()).toBe(0)
      expect(fs.existsSync(stray)).toBe(true)
    })

    it('returns 0 when the directory does not exist yet', async () => {
      const mod = await importFresh()
      expect(mod.sweepScrollback()).toBe(0)
    })

    it('sweeps several stale tabs in one pass', async () => {
      const mod = await importFresh()
      writeAged('a', WEEK_MS + 1000)
      writeAged('b', WEEK_MS + 2000)
      const kept = writeAged('c', 1000)

      expect(mod.sweepScrollback()).toBe(2)
      expect(fs.existsSync(kept)).toBe(true)
    })
  })
})
