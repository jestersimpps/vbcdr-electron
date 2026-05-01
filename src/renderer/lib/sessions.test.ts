import { describe, it, expect } from 'vitest'
import {
  rangeStartMs,
  buildSessions,
  activityToSessions,
  mergeSessions,
  clipSessionsToRange,
  formatHours,
  formatDuration,
  type ProjectCommits,
  type Session,
  type ActivitySessionInput
} from './sessions'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe('rangeStartMs', () => {
  const ref = new Date('2026-05-15T14:30:00Z')

  it('returns null for "all"', () => {
    expect(rangeStartMs('all', ref)).toBeNull()
  })

  it('returns midnight today for "today"', () => {
    const start = rangeStartMs('today', ref)!
    const d = new Date(start)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getDate()).toBe(ref.getDate())
  })

  it('returns Monday 00:00 for "week"', () => {
    const start = rangeStartMs('week', ref)!
    const d = new Date(start)
    expect(d.getDay()).toBe(1)
    expect(d.getHours()).toBe(0)
  })

  it('handles Sunday correctly for "week" (rolls back 6 days, not forward)', () => {
    const sunday = new Date('2026-05-17T10:00:00Z')
    const start = rangeStartMs('week', sunday)!
    const d = new Date(start)
    expect(d.getDay()).toBe(1)
    expect(start).toBeLessThan(sunday.getTime())
  })

  it('returns 1st of month for "month"', () => {
    const start = rangeStartMs('month', ref)!
    const d = new Date(start)
    expect(d.getDate()).toBe(1)
    expect(d.getMonth()).toBe(ref.getMonth())
  })

  it('returns Jan 1 for "ytd"', () => {
    const start = rangeStartMs('ytd', ref)!
    const d = new Date(start)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
    expect(d.getFullYear()).toBe(ref.getFullYear())
  })
})

describe('buildSessions', () => {
  const project = (id: string, name: string, ts: number[]): ProjectCommits => ({
    projectId: id,
    projectName: name,
    commits: ts.map((t, i) => ({
      hash: `${id}-${i}`,
      timestamp: t,
      authorEmail: 'a@b.c',
      authorName: 'A'
    }))
  })

  it('returns empty for no commits', () => {
    expect(buildSessions([project('p', 'P', [])], 30, 5)).toEqual([])
  })

  it('groups commits within gap into one session', () => {
    const t0 = 1_000_000_000_000
    const sessions = buildSessions(
      [project('p', 'P', [t0, t0 + 10 * MIN, t0 + 20 * MIN])],
      30,
      5
    )
    expect(sessions).toHaveLength(1)
    expect(sessions[0].commitCount).toBe(3)
    expect(sessions[0].start).toBe(t0 - 5 * MIN)
    expect(sessions[0].end).toBe(t0 + 20 * MIN)
    expect(sessions[0].durationMs).toBe(20 * MIN + 5 * MIN)
  })

  it('splits commits separated by more than gap', () => {
    const t0 = 1_000_000_000_000
    const sessions = buildSessions(
      [project('p', 'P', [t0, t0 + 60 * MIN])],
      30,
      5
    )
    expect(sessions).toHaveLength(2)
    expect(sessions[0].commitCount).toBe(1)
    expect(sessions[1].commitCount).toBe(1)
  })

  it('treats gap boundary inclusively (gap === gapMs joins)', () => {
    const t0 = 1_000_000_000_000
    const sessions = buildSessions(
      [project('p', 'P', [t0, t0 + 30 * MIN])],
      30,
      0
    )
    expect(sessions).toHaveLength(1)
  })

  it('sorts unsorted commits before grouping', () => {
    const t0 = 1_000_000_000_000
    const sessions = buildSessions(
      [project('p', 'P', [t0 + 20 * MIN, t0, t0 + 10 * MIN])],
      30,
      0
    )
    expect(sessions).toHaveLength(1)
    expect(sessions[0].start).toBe(t0)
    expect(sessions[0].end).toBe(t0 + 20 * MIN)
  })

  it('keeps sessions per project separate', () => {
    const t0 = 1_000_000_000_000
    const sessions = buildSessions(
      [project('a', 'A', [t0]), project('b', 'B', [t0])],
      30,
      0
    )
    expect(sessions).toHaveLength(2)
    expect(sessions.map((s) => s.projectId).sort()).toEqual(['a', 'b'])
  })
})

describe('activityToSessions', () => {
  it('drops activity for unknown projects', () => {
    const activity: ActivitySessionInput[] = [
      { projectId: 'known', start: 0, end: 100, durationMs: 100, inputCount: 1, outputCount: 1 },
      { projectId: 'unknown', start: 0, end: 100, durationMs: 100, inputCount: 1, outputCount: 1 }
    ]
    const out = activityToSessions(activity, { known: 'Known' })
    expect(out).toHaveLength(1)
    expect(out[0].projectName).toBe('Known')
    expect(out[0].commitCount).toBe(0)
  })
})

describe('mergeSessions', () => {
  const make = (projectId: string, start: number, end: number, count = 1): Session => ({
    projectId,
    projectName: projectId,
    start,
    end,
    durationMs: end - start,
    commitCount: count
  })

  it('merges overlapping sessions of same project', () => {
    const merged = mergeSessions([make('p', 0, 100, 1), make('p', 50, 200, 2)])
    expect(merged).toHaveLength(1)
    expect(merged[0].start).toBe(0)
    expect(merged[0].end).toBe(200)
    expect(merged[0].durationMs).toBe(200)
    expect(merged[0].commitCount).toBe(3)
  })

  it('merges touching sessions (start === prev.end)', () => {
    const merged = mergeSessions([make('p', 0, 100), make('p', 100, 200)])
    expect(merged).toHaveLength(1)
    expect(merged[0].end).toBe(200)
  })

  it('keeps non-overlapping sessions distinct', () => {
    const merged = mergeSessions([make('p', 0, 100), make('p', 200, 300)])
    expect(merged).toHaveLength(2)
  })

  it('does not merge across projects', () => {
    const merged = mergeSessions([make('a', 0, 100), make('b', 50, 200)])
    expect(merged).toHaveLength(2)
  })

  it('sorts unsorted input before merging', () => {
    const merged = mergeSessions([make('p', 50, 200, 1), make('p', 0, 100, 1)])
    expect(merged).toHaveLength(1)
    expect(merged[0].start).toBe(0)
    expect(merged[0].end).toBe(200)
  })
})

describe('clipSessionsToRange', () => {
  const s = (start: number, end: number): Session => ({
    projectId: 'p',
    projectName: 'P',
    start,
    end,
    durationMs: end - start,
    commitCount: 1
  })

  it('returns input unchanged when startMs is null', () => {
    const sessions = [s(0, 100)]
    expect(clipSessionsToRange(sessions, null)).toBe(sessions)
  })

  it('drops sessions ending before range start', () => {
    expect(clipSessionsToRange([s(0, 100)], 200)).toEqual([])
  })

  it('keeps sessions starting at or after range start', () => {
    const out = clipSessionsToRange([s(200, 300)], 100)
    expect(out).toHaveLength(1)
    expect(out[0].start).toBe(200)
  })

  it('clips sessions straddling range start', () => {
    const out = clipSessionsToRange([s(50, 200)], 100)
    expect(out).toHaveLength(1)
    expect(out[0].start).toBe(100)
    expect(out[0].end).toBe(200)
    expect(out[0].durationMs).toBe(100)
  })
})

describe('formatHours', () => {
  it('formats sub-hour as minutes', () => {
    expect(formatHours(30 * MIN)).toBe('30m')
  })
  it('formats <10h with one decimal', () => {
    expect(formatHours(2.5 * HOUR)).toBe('2.5h')
  })
  it('formats >=10h as integer hours', () => {
    expect(formatHours(12.4 * HOUR)).toBe('12h')
  })
  it('rounds to nearest minute under 1h', () => {
    expect(formatHours(29.5 * MIN)).toBe('30m')
  })
})

describe('formatDuration', () => {
  it('formats <60min as minutes', () => {
    expect(formatDuration(45 * MIN)).toBe('45m')
  })
  it('formats whole hours as "Nh"', () => {
    expect(formatDuration(3 * HOUR)).toBe('3h')
  })
  it('formats hours+minutes', () => {
    expect(formatDuration(2 * HOUR + 15 * MIN)).toBe('2h 15m')
  })
  it('rounds to nearest minute', () => {
    expect(formatDuration(2 * HOUR + 15 * MIN + 29_000)).toBe('2h 15m')
  })
})

describe('integration: buildSessions + mergeSessions + clipSessionsToRange', () => {
  it('builds, merges across sources, and clips to a window', () => {
    const t0 = new Date('2026-05-01T10:00:00Z').getTime()
    const projectCommits: ProjectCommits[] = [
      {
        projectId: 'p',
        projectName: 'P',
        commits: [
          { hash: 'a', timestamp: t0, authorEmail: 'x', authorName: 'x' },
          { hash: 'b', timestamp: t0 + 10 * MIN, authorEmail: 'x', authorName: 'x' }
        ]
      }
    ]
    const commitSessions = buildSessions(projectCommits, 30, 0)
    const activity: ActivitySessionInput[] = [
      { projectId: 'p', start: t0 + 5 * MIN, end: t0 + 20 * MIN, durationMs: 15 * MIN, inputCount: 1, outputCount: 1 }
    ]
    const activitySessions = activityToSessions(activity, { p: 'P' })
    const merged = mergeSessions([...commitSessions, ...activitySessions])
    expect(merged).toHaveLength(1)
    expect(merged[0].start).toBe(t0)
    expect(merged[0].end).toBe(t0 + 20 * MIN)

    const clipped = clipSessionsToRange(merged, t0 + 5 * MIN)
    expect(clipped[0].start).toBe(t0 + 5 * MIN)
    expect(clipped[0].durationMs).toBe(15 * MIN)
    void DAY
  })
})
