import { describe, it, expect } from 'vitest'
import { sdlcAnnouncements } from './companion-sdlc'
import { defaultSdlcColumns } from '@/models/sdlc-flow'
import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'

const COLUMNS = defaultSdlcColumns()
const names: Record<string, string> = { p1: 'vbcdr' }
const projectName = (id: string): string | null => names[id] ?? null

const ticket = (over: Partial<SdlcTicket> = {}): SdlcTicket => ({
  id: 't1',
  projectId: 'p1',
  title: 'Add a scoreboard',
  description: 'desc',
  stage: 'backlog',
  status: 'idle',
  branch: 'llm/add-a-scoreboard',
  worktreePath: '/repo/.worktrees/x',
  worktreeId: 'w1',
  tabId: null,
  agent: 'claude',
  createdAt: 0,
  updatedAt: 0,
  filesChanged: 0,
  linesAdded: 0,
  linesRemoved: 0,
  checks: [],
  attachments: [],
  comments: [],
  artifacts: EMPTY_ARTIFACTS,
  prUrl: null,
  prState: 'none',
  blockedReason: null,
  doneActionAt: null,
  doneOutcome: null,
  ...over
})

const texts = (before: SdlcTicket[], after: SdlcTicket[]): string[] =>
  sdlcAnnouncements(before, after, COLUMNS, projectName).map((a) => a.text)

describe('sdlcAnnouncements', () => {
  it('announces the flow starting when a ticket leaves the first column', () => {
    expect(texts([ticket()], [ticket({ stage: 'build' })])).toEqual([
      'starting the flow for "Add a scoreboard" in vbcdr, it moved to Build'
    ])
  })

  it('names both columns for a move further along', () => {
    expect(texts([ticket({ stage: 'build' })], [ticket({ stage: 'done' })])).toEqual([
      '"Add a scoreboard" in vbcdr moved from Build to Done'
    ])
  })

  it('announces the done prompt being run', () => {
    expect(texts([ticket({ stage: 'done' })], [ticket({ stage: 'done', doneActionAt: 5 })])).toEqual([
      'running the Done prompt for "Add a scoreboard" in vbcdr'
    ])
  })

  it.each([
    ['pr', '"Add a scoreboard" in vbcdr has a pull request open'],
    ['merged', '"Add a scoreboard" in vbcdr is merged'],
    ['branch', '"Add a scoreboard" in vbcdr was pushed to llm/add-a-scoreboard, no pull request'],
    ['no-pr', 'no pull request for "Add a scoreboard" in vbcdr, the work stays on llm/add-a-scoreboard']
  ] as const)('announces the %s outcome', (outcome, expected) => {
    const running = ticket({ stage: 'done', doneActionAt: 5 })
    expect(texts([running], [{ ...running, doneOutcome: outcome }])).toEqual([expected])
  })

  it('stays quiet for a ticket that is new, deleted or only patched', () => {
    const base = ticket()
    expect(texts([], [base])).toEqual([])
    expect(texts([base], [])).toEqual([])
    expect(texts([base], [{ ...base, status: 'running', updatedAt: 9 }])).toEqual([])
  })

  it('leaves the project out when it cannot be found', () => {
    expect(texts([ticket({ projectId: 'gone' })], [ticket({ projectId: 'gone', stage: 'build' })])).toEqual([
      'starting the flow for "Add a scoreboard", it moved to Build'
    ])
  })

  it('reports every ticket that moved in one change', () => {
    const a = ticket({ id: 'a', title: 'A', stage: 'build' })
    const b = ticket({ id: 'b', title: 'B' })
    expect(texts([a, b], [{ ...a, stage: 'done' }, { ...b, stage: 'build' }])).toHaveLength(2)
  })
})
