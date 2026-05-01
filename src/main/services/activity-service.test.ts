import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

const activityDir = (): string => path.join(userDataDir, 'activity')

let mod: typeof import('./activity-service')

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-'))
  mod = await import('./activity-service')
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('activity-service', () => {
  describe('recordActivity', () => {
    it('ignores empty projectIds', () => {
      mod.recordActivity('', 'i')
      mod.flushActivity()
      expect(fs.existsSync(activityDir())).toBe(false)
    })

    it('debounces writes and flushes after 1500ms', () => {
      mod.recordActivity('p1', 'i')
      mod.recordActivity('p1', 'o')
      const file = path.join(activityDir(), 'p1.jsonl')
      expect(fs.existsSync(file)).toBe(false)

      vi.advanceTimersByTime(1500)
      expect(fs.existsSync(file)).toBe(true)
      const lines = fs.readFileSync(file, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(2)
      const events = lines.map((l) => JSON.parse(l))
      expect(events.map((e) => e.k)).toEqual(['i', 'o'])
    })

    it('sanitises projectIds in the on-disk filename', () => {
      mod.recordActivity('weird/id with spaces', 'i')
      mod.flushActivity()
      const expectedFile = path.join(activityDir(), 'weird_id_with_spaces.jsonl')
      expect(fs.existsSync(expectedFile)).toBe(true)
    })
  })

  describe('flushActivity retry behaviour', () => {
    it('keeps pending lines around when the write fails so the next flush retries', () => {
      mod.recordActivity('p1', 'i')

      const spy = vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => {
        throw new Error('disk full')
      })
      mod.flushActivity()
      expect(spy).toHaveBeenCalledTimes(1)
      expect(fs.existsSync(path.join(activityDir(), 'p1.jsonl'))).toBe(false)

      spy.mockRestore()
      mod.flushActivity()
      const file = path.join(activityDir(), 'p1.jsonl')
      expect(fs.existsSync(file)).toBe(true)
      expect(fs.readFileSync(file, 'utf-8').trim().split('\n')).toHaveLength(1)
    })
  })

  describe('getSessions', () => {
    it('groups close-together events into one session, including pending writes', () => {
      mod.recordActivity('p1', 'i')
      vi.setSystemTime(new Date(Date.now() + 60_000))
      mod.recordActivity('p1', 'o')
      mod.flushActivity()

      const sessions = mod.getSessions('p1', null, 5)
      expect(sessions).toHaveLength(1)
      expect(sessions[0].inputCount).toBe(1)
      expect(sessions[0].outputCount).toBe(1)
      expect(sessions[0].durationMs).toBeGreaterThan(0)
    })

    it('splits events further apart than idleMinutes into separate sessions', () => {
      mod.recordActivity('p1', 'i')
      mod.flushActivity()
      vi.setSystemTime(new Date(Date.now() + 10 * 60_000))
      mod.recordActivity('p1', 'o')
      mod.flushActivity()

      const sessions = mod.getSessions('p1', null, 5)
      expect(sessions).toHaveLength(2)
      expect(sessions[0].inputCount).toBe(1)
      expect(sessions[1].outputCount).toBe(1)
    })

    it('honours the sinceIso filter', () => {
      mod.recordActivity('p1', 'i')
      mod.flushActivity()
      const cutoff = new Date(Date.now() + 60_000).toISOString()
      vi.setSystemTime(new Date(Date.now() + 120_000))
      mod.recordActivity('p1', 'o')
      mod.flushActivity()

      const sessions = mod.getSessions('p1', cutoff, 5)
      expect(sessions).toHaveLength(1)
      expect(sessions[0].outputCount).toBe(1)
      expect(sessions[0].inputCount).toBe(0)
    })

    it('returns events from pendingLines even before they are flushed to disk', () => {
      mod.recordActivity('p1', 'i')
      const sessions = mod.getSessions('p1', null, 5)
      expect(sessions).toHaveLength(1)
      expect(sessions[0].inputCount).toBe(1)
    })

    it('skips malformed JSON lines silently', () => {
      fs.mkdirSync(activityDir(), { recursive: true })
      fs.writeFileSync(
        path.join(activityDir(), 'p1.jsonl'),
        '{not valid json}\n{"t":' + Date.now() + ',"k":"i"}\n'
      )
      const sessions = mod.getSessions('p1', null, 5)
      expect(sessions).toHaveLength(1)
      expect(sessions[0].inputCount).toBe(1)
    })
  })

  describe('getAllSessions', () => {
    it('aggregates sessions across all on-disk projects', () => {
      mod.recordActivity('p1', 'i')
      mod.recordActivity('p2', 'o')
      mod.flushActivity()

      const sessions = mod.getAllSessions(null, 5)
      expect(sessions).toHaveLength(2)
      const projects = sessions.map((s) => s.projectId).sort()
      expect(projects).toEqual(['p1', 'p2'])
    })

    it('also includes pending-only projects with no on-disk file yet', () => {
      mod.recordActivity('only-pending', 'i')
      const sessions = mod.getAllSessions(null, 5)
      expect(sessions.some((s) => s.projectId === 'only-pending')).toBe(true)
    })
  })

  describe('purgeProjectActivity', () => {
    it('drops pending state and deletes the on-disk file', () => {
      mod.recordActivity('p1', 'i')
      mod.flushActivity()
      const file = path.join(activityDir(), 'p1.jsonl')
      expect(fs.existsSync(file)).toBe(true)

      mod.purgeProjectActivity('p1')
      expect(fs.existsSync(file)).toBe(false)
      expect(mod.getSessions('p1', null, 5)).toEqual([])
    })

    it('is safe to call when nothing exists for the project', () => {
      expect(() => mod.purgeProjectActivity('ghost')).not.toThrow()
    })
  })

  describe('compactActivity', () => {
    it('removes events older than 90 days and rewrites the file', () => {
      const now = Date.now()
      const old = now - 100 * 24 * 60 * 60 * 1000
      const recent = now - 1 * 24 * 60 * 60 * 1000

      fs.mkdirSync(activityDir(), { recursive: true })
      fs.writeFileSync(
        path.join(activityDir(), 'p1.jsonl'),
        `{"t":${old},"k":"i"}\n{"t":${recent},"k":"o"}\n`
      )

      mod.compactActivity()
      const after = fs.readFileSync(path.join(activityDir(), 'p1.jsonl'), 'utf-8')
      const lines = after.trim().split('\n').map((l) => JSON.parse(l))
      expect(lines).toHaveLength(1)
      expect(lines[0].k).toBe('o')
    })

    it('deletes the file when every event is too old', () => {
      const old = Date.now() - 200 * 24 * 60 * 60 * 1000
      fs.mkdirSync(activityDir(), { recursive: true })
      const file = path.join(activityDir(), 'p1.jsonl')
      fs.writeFileSync(file, `{"t":${old},"k":"i"}\n`)

      mod.compactActivity()
      expect(fs.existsSync(file)).toBe(false)
    })

    it('is idempotent within the same process — second call is a no-op', () => {
      const recent = Date.now() - 1000
      fs.mkdirSync(activityDir(), { recursive: true })
      fs.writeFileSync(path.join(activityDir(), 'p1.jsonl'), `{"t":${recent},"k":"i"}\n`)
      mod.compactActivity()
      const writeSpy = vi.spyOn(fs, 'writeFileSync')
      mod.compactActivity()
      expect(writeSpy).not.toHaveBeenCalled()
      writeSpy.mockRestore()
    })
  })
})
