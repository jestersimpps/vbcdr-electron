import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_COMMAND,
  NEW_AGENT_COLUMN_PROMPT,
  columnIdFrom,
  defaultSdlcColumns,
  earlierAgentColumns,
  newAgentColumn,
  sanitizeColumns
} from './sdlc-flow'

function flowWith(...ids: string[]): ReturnType<typeof defaultSdlcColumns> {
  const columns = defaultSdlcColumns()
  const last = columns.length - 1
  return [...columns.slice(0, last), ...ids.map((id) => newAgentColumn(id, id)), columns[last]]
}

describe('columnIdFrom', () => {
  it('slugs the label and stays unique against the columns already there', () => {
    expect(columnIdFrom('Security Audit!', [])).toBe('security-audit')
    expect(columnIdFrom('Review', ['review', 'review-2'])).toBe('review-3')
    expect(columnIdFrom('???', [])).toBe('column')
  })
})

describe('earlierAgentColumns', () => {
  it('lists only the agent columns before the given one', () => {
    expect(earlierAgentColumns(flowWith('audit'), 'audit').map((c) => c.id)).toEqual([
      'planning',
      'implementing',
      'review'
    ])
    expect(earlierAgentColumns(defaultSdlcColumns(), 'planning')).toEqual([])
  })
})

describe('sanitizeColumns', () => {
  it('returns the default flow for anything that is not a usable list', () => {
    expect(sanitizeColumns(undefined).map((c) => c.id)).toEqual(defaultSdlcColumns().map((c) => c.id))
    expect(sanitizeColumns([{ id: 'only', kind: 'human' }])).toHaveLength(5)
  })

  it('forces the flow into shape: human first, terminal last, agents between', () => {
    const columns = sanitizeColumns([
      { id: 'a', kind: 'agent' },
      { id: 'b', kind: 'terminal' },
      { id: 'c', kind: 'human' },
      { id: 'd', kind: 'agent' }
    ])
    expect(columns.map((c) => c.kind)).toEqual(['human', 'agent', 'agent', 'terminal'])
    expect(columns[2]).toMatchObject({ command: DEFAULT_AGENT_COMMAND, prompt: NEW_AGENT_COLUMN_PROMPT })
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
    expect(columns.map((c) => c.command)).toEqual(['', DEFAULT_AGENT_COMMAND, 'claude', 'codex', ''])
  })
})
