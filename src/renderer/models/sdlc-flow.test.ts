import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_COMMAND,
  DONE_COLUMN_PROMPT,
  columnIdFrom,
  columnPrompt,
  defaultSdlcColumns,
  earlierAgentColumns,
  newAgentColumn,
  sanitizeColumns
} from './sdlc-flow'
import { threeStageFlow } from './sdlc-flow.fixtures'

function flowWith(...ids: string[]): ReturnType<typeof defaultSdlcColumns> {
  const columns = threeStageFlow()
  const last = columns.length - 1
  return [...columns.slice(0, last), ...ids.map((id) => newAgentColumn(id, id, [])), columns[last]]
}

describe('columnIdFrom', () => {
  it('slugs the label and stays unique against the columns already there', () => {
    expect(columnIdFrom('Security Audit!', [])).toBe('security-audit')
    expect(columnIdFrom('Review', ['review', 'review-2'])).toBe('review-3')
    expect(columnIdFrom('???', [])).toBe('column')
  })
})

describe('default flow', () => {
  it('gives the last column a startup command and an on-demand pull-request prompt without a result file', () => {
    const done = defaultSdlcColumns()[2]
    expect(done.command).toBe(DEFAULT_AGENT_COMMAND)
    expect(done.prompt).toBe(DONE_COLUMN_PROMPT)
    for (const variable of ['worktreePath', 'branch', 'projectPath', 'title', 'description', 'pr']) {
      expect(done.prompt).toContain(`{{${variable}}}`)
    }
    expect(done.prompt).toContain('gh pr create --base master')
    expect(done.prompt).toContain('rebase')
    expect(done.prompt).not.toContain('stage-output.md')
  })

  it('fills in the command and prompt of a last column saved before it had them', () => {
    const columns = sanitizeColumns([
      { id: 'backlog', kind: 'human' },
      { id: 'review', kind: 'agent', command: 'claude', prompt: 'review' },
      { id: 'done', kind: 'terminal', command: '', prompt: '' }
    ])
    expect(columns[2].command).toBe(DEFAULT_AGENT_COMMAND)
    expect(columns[2].prompt).toBe(DONE_COLUMN_PROMPT)
  })

  it('ships a single agent column between backlog and done', () => {
    expect(defaultSdlcColumns().map((c) => [c.id, c.kind])).toEqual([
      ['backlog', 'human'],
      ['build', 'agent'],
      ['done', 'terminal']
    ])
  })
})

describe('columnPrompt', () => {
  it('carries every handover variable and the result of each agent column before it', () => {
    const [, planning, implementing] = threeStageFlow()
    const prompt = columnPrompt([planning, implementing])
    for (const variable of ['title', 'description', 'branch', 'worktreePath', 'projectPath', 'diff']) {
      expect(prompt).toContain(`{{${variable}}}`)
    }
    expect(prompt).toContain('Result of Planning:\n{{output.planning}}')
    expect(prompt).toContain('Result of Implementing:\n{{output.implementing}}')
    expect(prompt).toContain('.vbcdr/stage-output.md')
  })

  it('reads no earlier results for the first agent column', () => {
    expect(columnPrompt([])).not.toContain('{{output.')
  })
})

describe('earlierAgentColumns', () => {
  it('lists only the agent columns before the given one', () => {
    expect(earlierAgentColumns(flowWith('audit'), 'audit').map((c) => c.id)).toEqual([
      'planning',
      'implementing',
      'review'
    ])
    expect(earlierAgentColumns(threeStageFlow(), 'planning')).toEqual([])
  })
})

describe('sanitizeColumns', () => {
  it('returns the default flow for anything that is not a usable list', () => {
    expect(sanitizeColumns(undefined).map((c) => c.id)).toEqual(defaultSdlcColumns().map((c) => c.id))
    expect(sanitizeColumns([{ id: 'only', kind: 'human' }])).toHaveLength(3)
  })

  it('forces the flow into shape: human first, terminal last, agents between', () => {
    const columns = sanitizeColumns([
      { id: 'a', kind: 'agent' },
      { id: 'b', kind: 'terminal' },
      { id: 'c', kind: 'human' },
      { id: 'd', kind: 'agent' }
    ])
    expect(columns.map((c) => c.kind)).toEqual(['human', 'agent', 'agent', 'terminal'])
    expect(columns[2]).toMatchObject({ command: DEFAULT_AGENT_COMMAND, prompt: columnPrompt([columns[1]]) })
  })

  it('drops duplicate ids and unknown kinds', () => {
    const columns = sanitizeColumns([
      { id: 'a', kind: 'human' },
      { id: 'a', kind: 'agent' },
      { id: 'x', kind: 'robot' },
      { id: 'b', kind: 'agent' },
      { id: 'z', kind: 'terminal' }
    ])
    expect(columns.map((c) => c.id)).toEqual(['a', 'b', 'z'])
  })

  it('turns the old unattended switch into a startup command', () => {
    const columns = sanitizeColumns([
      { id: 'a', kind: 'human' },
      { id: 'b', kind: 'agent', autonomous: true },
      { id: 'c', kind: 'agent', autonomous: false },
      { id: 'd', kind: 'agent', command: 'codex' },
      { id: 'z', kind: 'terminal' }
    ])
    expect(columns.map((c) => c.command)).toEqual(['', DEFAULT_AGENT_COMMAND, 'claude', 'codex', DEFAULT_AGENT_COMMAND])
  })
})
