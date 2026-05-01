import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

const tokenDir = (): string => path.join(userDataDir, 'token-usage')
const tokenFile = (): string => path.join(tokenDir(), 'events.jsonl')

let mod: typeof import('./token-usage-service')

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-01T12:00:00Z'))
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok-'))
  mod = await import('./token-usage-service')
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('token-usage-service', () => {
  describe('recordTokenSnapshot', () => {
    it('records the delta between successive snapshots and ignores no-ops', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.recordTokenSnapshot('tab1', 'p1', 250)
      mod.flushTokenUsage()

      const events = mod.getEvents(null)
      expect(events).toHaveLength(2)
      expect(events.map((e) => e.d)).toEqual([100, 150])
      expect(events.every((e) => e.p === 'p1')).toBe(true)
    })

    it('skips invalid inputs (empty ids, NaN, negative)', () => {
      mod.recordTokenSnapshot('', 'p1', 50)
      mod.recordTokenSnapshot('tab1', '', 50)
      mod.recordTokenSnapshot('tab1', 'p1', NaN)
      mod.recordTokenSnapshot('tab1', 'p1', -5)
      mod.flushTokenUsage()
      expect(mod.getEvents(null)).toEqual([])
    })

    it('treats decreasing token totals as no delta (e.g. context cleared)', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 200)
      mod.recordTokenSnapshot('tab1', 'p1', 50)
      mod.flushTokenUsage()
      const events = mod.getEvents(null)
      expect(events).toHaveLength(1)
      expect(events[0].d).toBe(200)
    })

    it('isolates token-tracking state per tab', () => {
      mod.recordTokenSnapshot('tabA', 'p1', 100)
      mod.recordTokenSnapshot('tabB', 'p1', 50)
      mod.recordTokenSnapshot('tabA', 'p1', 130)
      mod.flushTokenUsage()
      const events = mod.getEvents(null)
      expect(events.map((e) => e.d).sort((a, b) => a - b)).toEqual([30, 50, 100])
    })

    it('resetTabTokenTracking causes the next snapshot to record the full value', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.flushTokenUsage()
      mod.resetTabTokenTracking('tab1')
      mod.recordTokenSnapshot('tab1', 'p1', 70)
      mod.flushTokenUsage()
      const deltas = mod.getEvents(null).map((e) => e.d)
      expect(deltas).toEqual([100, 70])
    })
  })

  describe('flushTokenUsage', () => {
    it('debounces appends and writes after 1500ms', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      expect(fs.existsSync(tokenFile())).toBe(false)
      vi.advanceTimersByTime(1500)
      expect(fs.existsSync(tokenFile())).toBe(true)
      const lines = fs.readFileSync(tokenFile(), 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(1)
    })

    it('is a no-op when nothing is pending', () => {
      mod.flushTokenUsage()
      expect(fs.existsSync(tokenFile())).toBe(false)
    })
  })

  describe('getEvents / getDailyUsage', () => {
    it('reflects events on disk after flush', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.flushTokenUsage()
      const events = mod.getEvents(null)
      expect(events).toHaveLength(1)
      expect(events[0].d).toBe(100)
    })

    it('honours the sinceIso filter', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.flushTokenUsage()
      const cutoff = new Date(Date.now() + 30_000).toISOString()
      vi.setSystemTime(new Date(Date.now() + 60_000))
      mod.recordTokenSnapshot('tab1', 'p1', 250)
      mod.flushTokenUsage()

      const filtered = mod.getEvents(cutoff)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].d).toBe(150)
    })

    it('aggregates daily totals across projects, sorted by date', () => {
      vi.setSystemTime(new Date('2026-05-01T12:00:00Z'))
      mod.recordTokenSnapshot('tabA', 'p1', 100)
      vi.setSystemTime(new Date('2026-05-01T18:00:00Z'))
      mod.recordTokenSnapshot('tabB', 'p2', 200)
      vi.setSystemTime(new Date('2026-05-02T08:00:00Z'))
      mod.recordTokenSnapshot('tabA', 'p1', 150)
      mod.flushTokenUsage()

      const daily = mod.getDailyUsage(null)
      expect(daily).toHaveLength(2)
      expect(daily[0].date.localeCompare(daily[1].date)).toBeLessThan(0)

      const day1 = daily.find((d) => d.date.endsWith('-01'))!
      expect(day1.total).toBe(300)
      expect(day1.perProject.p1).toBe(100)
      expect(day1.perProject.p2).toBe(200)
    })
  })

  describe('purgeProjectTokenUsage', () => {
    it('drops all events (pending + on disk + cache) for the given project', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.recordTokenSnapshot('tab2', 'p2', 200)
      mod.flushTokenUsage()
      mod.recordTokenSnapshot('tab3', 'p1', 50)

      mod.purgeProjectTokenUsage('p1')
      const events = mod.getEvents(null)
      expect(events.every((e) => e.p === 'p2')).toBe(true)
    })

    it('removes the file when no events remain for any project', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.flushTokenUsage()
      expect(fs.existsSync(tokenFile())).toBe(true)
      mod.purgeProjectTokenUsage('p1')
      expect(fs.existsSync(tokenFile())).toBe(false)
    })

    it('is a no-op for empty projectId', () => {
      mod.recordTokenSnapshot('tab1', 'p1', 100)
      mod.flushTokenUsage()
      mod.purgeProjectTokenUsage('')
      expect(mod.getEvents(null)).toHaveLength(1)
    })
  })

  describe('compactTokenUsage', () => {
    it('drops events older than the 365-day retention window', () => {
      const now = Date.now()
      const stale = now - 400 * 24 * 60 * 60 * 1000
      const fresh = now - 1 * 24 * 60 * 60 * 1000

      fs.mkdirSync(tokenDir(), { recursive: true })
      fs.writeFileSync(
        tokenFile(),
        `{"t":${stale},"p":"p1","d":1}\n{"t":${fresh},"p":"p1","d":2}\n`
      )

      mod.compactTokenUsage()
      const remaining = fs.readFileSync(tokenFile(), 'utf-8').trim().split('\n')
      expect(remaining).toHaveLength(1)
      const ev = JSON.parse(remaining[0])
      expect(ev.t).toBe(fresh)
    })

    it('deletes the file when every event is past retention', () => {
      const stale = Date.now() - 500 * 24 * 60 * 60 * 1000
      fs.mkdirSync(tokenDir(), { recursive: true })
      fs.writeFileSync(tokenFile(), `{"t":${stale},"p":"p1","d":1}\n`)

      mod.compactTokenUsage()
      expect(fs.existsSync(tokenFile())).toBe(false)
    })

    it('throttles compactions to once per 24h', () => {
      const old = Date.now() - 500 * 24 * 60 * 60 * 1000
      fs.mkdirSync(tokenDir(), { recursive: true })
      fs.writeFileSync(tokenFile(), `{"t":${old},"p":"p1","d":1}\n`)
      mod.compactTokenUsage()
      expect(fs.existsSync(tokenFile())).toBe(false)

      fs.writeFileSync(tokenFile(), `{"t":${old},"p":"p1","d":1}\n`)
      mod.compactTokenUsage()
      expect(fs.existsSync(tokenFile())).toBe(true)
    })
  })
})
