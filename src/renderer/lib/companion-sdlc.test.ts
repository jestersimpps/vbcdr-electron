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
    expect(texts([ticket()], [ticket({ stage: 'build' })])).toEqual(['kicking off "Add a scoreboard" in vbcdr, Build has it now'])
  })

  it('names the next agent column for a move further along', () => {
    const review = { ...COLUMNS[1], id: 'review', label: 'Review' }
    const columns = [COLUMNS[0], COLUMNS[1], review, COLUMNS[2]]
    const moved = sdlcAnnouncements([ticket({ stage: 'build' })], [ticket({ stage: 'review' })], columns, projectName)
    expect(moved.map((a) => a.text)).toEqual(['"Add a scoreboard" in vbcdr is on to Review now'])
  })

  it('celebrates a ticket reaching the last column', () => {
    expect(texts([ticket({ stage: 'build' })], [ticket({ stage: 'done' })])).toEqual([
      'nice, "Add a scoreboard" in vbcdr made it all the way to Done!'
    ])
  })

  it('says when a ticket is sent back to an earlier column', () => {
    expect(texts([ticket({ stage: 'done' })], [ticket({ stage: 'build' })])).toEqual([
      '"Add a scoreboard" in vbcdr went back to Build for another pass'
    ])
  })

  it('announces the done prompt being run from the board', () => {
    const run = ticket({ stage: 'done', doneActionAt: 5, doneActionBy: 'manual' })
    expect(texts([ticket({ stage: 'done' })], [run])).toEqual(['"Add a scoreboard" in vbcdr is done, now finalizing it'])
  })

  it('says the timer started the done prompt', () => {
    const run = ticket({ stage: 'done', doneActionAt: 5, doneActionBy: 'timer' })
    expect(texts([ticket({ stage: 'done' })], [run])).toEqual([
      'timer went off, running the final prompt for "Add a scoreboard" in vbcdr'
    ])
  })

  it.each([
    ['pr', 'the pull request for "Add a scoreboard" in vbcdr is up, ready for your review'],
    ['merged', '"Add a scoreboard" in vbcdr is merged. Shipped!'],
    ['branch', '"Add a scoreboard" in vbcdr is pushed to llm/add-a-scoreboard, no pull request this time'],
    ['no-pr', "heads up, nothing was pushed for \"Add a scoreboard\" in vbcdr, it's still sitting on llm/add-a-scoreboard"]
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
      'kicking off "Add a scoreboard", Build has it now'
    ])
  })

  it('reports every ticket that moved in one change', () => {
    const a = ticket({ id: 'a', title: 'A', stage: 'build' })
    const b = ticket({ id: 'b', title: 'B' })
    expect(texts([a, b], [{ ...a, stage: 'done' }, { ...b, stage: 'build' }])).toHaveLength(2)
  })
})
