import { describe, expect, it } from 'vitest'
import {
  columnIdFrom,
  columnLayout,
  defaultSdlcColumns,
  earlierAgentColumns,
  newAgentColumn,
  sanitizeColumns,
  sendBackTarget
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

describe('sendBackTarget', () => {
  it('defaults to the column on the left', () => {
    expect(sendBackTarget(defaultSdlcColumns(), 'review')?.id).toBe('implementing')
  })

  it('honours a configured target that still sits to the left', () => {
    const columns = defaultSdlcColumns().map((c) => (c.id === 'review' ? { ...c, sendBackTo: 'planning' } : c))
    expect(sendBackTarget(columns, 'review')?.id).toBe('planning')
  })

  it('falls back to the neighbour when the target was deleted or moved to the right', () => {
    const columns = defaultSdlcColumns().map((c) => (c.id === 'planning' ? { ...c, sendBackTo: 'review' } : c))
    expect(sendBackTarget(columns, 'planning')?.id).toBe('backlog')
    const gone = defaultSdlcColumns().map((c) => (c.id === 'review' ? { ...c, sendBackTo: 'deleted' } : c))
    expect(sendBackTarget(gone, 'review')?.id).toBe('implementing')
  })

  it('has nowhere to go from the first column or the terminal one', () => {
    expect(sendBackTarget(defaultSdlcColumns(), 'backlog')).toBeNull()
    expect(sendBackTarget(defaultSdlcColumns(), 'done')).toBeNull()
  })
})

describe('columnLayout', () => {
  it('derives the modal layout from where the column sits', () => {
    const columns = flowWith('audit')
    expect(columnLayout(columns, 'backlog')).toBe('form')
    expect(columnLayout(columns, 'audit')).toBe('workspace')
    expect(columnLayout(columns, 'done')).toBe('summary')
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

  it('forces the ends back into shape: human first, terminal last and nowhere else', () => {
    const columns = sanitizeColumns([
      { id: 'a', kind: 'agent' },
      { id: 'b', kind: 'terminal' },
      { id: 'c', kind: 'agent' }
    ])
    expect(columns.map((c) => c.kind)).toEqual(['human', 'human', 'terminal'])
  })

  it('drops duplicate ids, unknown kinds and unknown panels', () => {
    const columns = sanitizeColumns([
      { id: 'a', kind: 'human' },
      { id: 'a', kind: 'agent' },
      { id: 'x', kind: 'robot' },
      { id: 'b', kind: 'agent', panels: [{ kind: 'diff' }, { kind: 'hologram' }] },
      { id: 'z', kind: 'terminal' }
    ])
    expect(columns.map((c) => c.id)).toEqual(['a', 'b', 'z'])
    expect(columns[1].panels.map((p) => p.kind)).toEqual(['diff'])
  })
})
