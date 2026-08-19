import { describe, it, expect } from 'vitest'
import {
  buildActivityLog,
  activityLogToMarkdown,
  dayKeyOf,
  isNoiseCommit,
  formatDayLabel,
  type AgentSession,
  type ProjectCommitsInput
} from './activity-log'

const DAY = 86_400_000

function at(iso: string): number {
  return new Date(iso).getTime()
}

function session(over: Partial<AgentSession>): AgentSession {
  return {
    id: 'sess',
    agent: 'claude',
    projectPath: '/p/alpha',
    title: 'Some session',
    start: at('2026-05-15T10:00:00'),
    end: at('2026-05-15T11:00:00'),
    userTurns: 3,
    ...over
  }
}

const alpha: ProjectCommitsInput = {
  projectId: 'a',
  projectName: 'alpha',
  projectPath: '/p/alpha',
  commits: []
}

describe('dayKeyOf', () => {
  it('keys by local calendar day', () => {
    expect(dayKeyOf(at('2026-05-15T23:30:00'))).toBe('2026-05-15')
    expect(dayKeyOf(at('2026-05-16T00:10:00'))).toBe('2026-05-16')
  })
})

describe('isNoiseCommit', () => {
  it('filters merge commits', () => {
    expect(isNoiseCommit('Merge branch main into dev')).toBe(true)
    expect(isNoiseCommit('Merge pull request #12')).toBe(true)
    expect(isNoiseCommit('Fix the merge conflict handler')).toBe(false)
  })
})

describe('buildActivityLog', () => {
  it('groups commits and sessions by day and project', () => {
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'h1', timestamp: at('2026-05-15T09:00:00'), authorEmail: '', authorName: '', message: 'Add login' },
            { hash: 'h2', timestamp: at('2026-05-14T09:00:00'), authorEmail: '', authorName: '', message: 'Older work' }
          ]
        }
      ],
      [session({ title: 'Build the login flow' })]
    )

    expect(days.map((d) => d.dayKey)).toEqual(['2026-05-15', '2026-05-14'])

    const today = days[0]
    expect(today.projects).toHaveLength(1)
    expect(today.projects[0].projectName).toBe('alpha')
    expect(today.projects[0].commits.map((c) => c.message)).toEqual(['Add login'])
    expect(today.projects[0].sessions.map((s) => s.title)).toEqual(['Build the login flow'])
    expect(today.commitCount).toBe(1)
    expect(today.sessionCount).toBe(1)
  })

  it('drops merge commits', () => {
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'h1', timestamp: at('2026-05-15T09:00:00'), authorEmail: '', authorName: '', message: 'Merge branch dev' }
          ]
        }
      ],
      []
    )
    expect(days).toHaveLength(0)
  })

  it('dedupes the same commit message on the same day across branches', () => {
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'h1', timestamp: at('2026-05-15T09:00:00'), authorEmail: '', authorName: '', message: 'Add login' },
            { hash: 'h2-cherrypick', timestamp: at('2026-05-15T11:00:00'), authorEmail: '', authorName: '', message: 'Add login' }
          ]
        }
      ],
      []
    )
    expect(days[0].projects[0].commits).toHaveLength(1)
    expect(days[0].commitCount).toBe(1)
  })

  it('keeps the same message when it lands on different days', () => {
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'h1', timestamp: at('2026-05-15T09:00:00'), authorEmail: '', authorName: '', message: 'Bump version' },
            { hash: 'h2', timestamp: at('2026-05-14T09:00:00'), authorEmail: '', authorName: '', message: 'Bump version' }
          ]
        }
      ],
      []
    )
    expect(days).toHaveLength(2)
  })

  it('ignores sessions whose project path is unknown', () => {
    const days = buildActivityLog([alpha], [session({ projectPath: '/p/unknown' })])
    expect(days).toHaveLength(0)
  })

  it('sorts projects within a day by most recent activity', () => {
    const beta: ProjectCommitsInput = {
      projectId: 'b',
      projectName: 'beta',
      projectPath: '/p/beta',
      commits: [
        { hash: 'b1', timestamp: at('2026-05-15T18:00:00'), authorEmail: '', authorName: '', message: 'Later' }
      ]
    }
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'a1', timestamp: at('2026-05-15T08:00:00'), authorEmail: '', authorName: '', message: 'Earlier' }
          ]
        },
        beta
      ],
      []
    )
    expect(days[0].projects.map((p) => p.projectName)).toEqual(['beta', 'alpha'])
  })

  it('merges commits and sessions for the same project on the same day', () => {
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'h1', timestamp: at('2026-05-15T09:00:00'), authorEmail: '', authorName: '', message: 'Add login' }
          ]
        }
      ],
      [session({}), session({ id: 's2', title: 'Second' })]
    )
    expect(days).toHaveLength(1)
    expect(days[0].projects).toHaveLength(1)
    expect(days[0].sessionCount).toBe(2)
    expect(days[0].commitCount).toBe(1)
  })
})

describe('formatDayLabel', () => {
  const now = at('2026-05-15T12:00:00')

  it('labels today and yesterday', () => {
    expect(formatDayLabel(at('2026-05-15T08:00:00'), now)).toBe('Today')
    expect(formatDayLabel(now - DAY, now)).toBe('Yesterday')
  })

  it('labels older days with a date', () => {
    const label = formatDayLabel(at('2026-05-10T08:00:00'), now)
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    expect(label.length).toBeGreaterThan(0)
  })
})

describe('activityLogToMarkdown', () => {
  const now = at('2026-05-15T12:00:00')

  it('renders days, projects, sessions and commits', () => {
    const days = buildActivityLog(
      [
        {
          ...alpha,
          commits: [
            { hash: 'abcdef1234567', timestamp: at('2026-05-15T09:00:00'), authorEmail: '', authorName: '', message: 'Add login' }
          ]
        }
      ],
      [session({ title: 'Build the login flow' })]
    )
    const md = activityLogToMarkdown(days, now)

    expect(md).toContain('# Activity log')
    expect(md).toContain('## Today (2026-05-15)')
    expect(md).toContain('### alpha')
    expect(md).toContain('- Claude: Build the login flow')
    expect(md).toContain('- `abcdef1` Add login')
    expect(md).toContain('1 session · 1 commit')
  })

  it('labels codex sessions distinctly', () => {
    const days = buildActivityLog([alpha], [session({ agent: 'codex', title: 'Codex work' })])
    expect(activityLogToMarkdown(days, now)).toContain('- Codex: Codex work')
  })

  it('handles an empty log', () => {
    expect(activityLogToMarkdown([], now)).toContain('_No activity recorded._')
  })

  it('ends with exactly one trailing newline', () => {
    const days = buildActivityLog([alpha], [session({})])
    const md = activityLogToMarkdown(days, now)
    expect(md.endsWith('\n')).toBe(true)
    expect(md.endsWith('\n\n')).toBe(false)
  })
})
