import { beforeEach, describe, expect, it } from 'vitest'
import { upgradeLegacyPrompt, useSdlcFlowStore } from './sdlc-flow-store'
import { upgradeLegacyArtifacts, useSdlcStore } from './sdlc-store'
import { useSdlcPromptsStore } from './sdlc-prompts-store'
import { deleteColumn, resetFlow } from '@/lib/sdlc-flow'
import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'

function ids(): string[] {
  return useSdlcFlowStore.getState().columns.map((c) => c.id)
}

function ticket(id: string, stage: string, status: SdlcTicket['status'] = 'idle'): SdlcTicket {
  return { ...useSdlcStore.getState().createTicket({ projectId: 'p1', description: id, attachments: [] }), id, stage, status }
}

beforeEach(() => {
  useSdlcFlowStore.getState().resetColumns()
  useSdlcStore.setState({ tickets: [] })
  useSdlcPromptsStore.setState({ promptsPerProject: {} })
})

describe('sdlc flow store', () => {
  it('adds a column before the given one, never outside the fixed ends', () => {
    const flow = useSdlcFlowStore.getState()
    flow.addColumn('Audit', 'review')
    expect(ids()).toEqual(['backlog', 'planning', 'implementing', 'audit', 'review', 'done'])
    flow.addColumn('Triage', 'backlog')
    expect(ids()[0]).toBe('backlog')
    expect(ids()[1]).toBe('triage')
    flow.addColumn('Nowhere', 'missing')
    expect(ids()[ids().length - 1]).toBe('done')
  })

  it('keeps the id when a column is renamed, so tickets and prompt variables still find it', () => {
    const flow = useSdlcFlowStore.getState()
    const column = flow.addColumn('Audit', 'review')
    flow.updateColumn(column.id, { label: 'Security audit' })
    expect(useSdlcFlowStore.getState().columns.find((c) => c.id === 'audit')?.label).toBe('Security audit')
  })

  it('reorders only among the middle columns', () => {
    const flow = useSdlcFlowStore.getState()
    flow.reorderColumn('planning', 3)
    expect(ids()).toEqual(['backlog', 'implementing', 'review', 'planning', 'done'])
    flow.reorderColumn('planning', 0)
    flow.reorderColumn('planning', 4)
    flow.reorderColumn('backlog', 2)
    flow.reorderColumn('done', 1)
    expect(ids()).toEqual(['backlog', 'implementing', 'review', 'planning', 'done'])
  })

  it('keeps every column between the ends an agent, since nothing would move a ticket out of a human one', () => {
    useSdlcFlowStore.getState().updateColumn('planning', { kind: 'human' })
    expect(useSdlcFlowStore.getState().columns[1].kind).toBe('agent')
  })

  it('refuses to remove or retype the ends', () => {
    const flow = useSdlcFlowStore.getState()
    flow.removeColumn('backlog')
    flow.removeColumn('done')
    flow.updateColumn('backlog', { kind: 'agent' })
    flow.updateColumn('done', { kind: 'human' })
    const { columns } = useSdlcFlowStore.getState()
    expect(columns).toHaveLength(5)
    expect(columns[0].kind).toBe('human')
    expect(columns[4].kind).toBe('terminal')
  })
})

describe('deleteColumn', () => {
  it('moves the tickets out idle, then removes the column and its project overrides', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'planning', 'blocked'), ticket('b', 'review')] })
    useSdlcPromptsStore.getState().setStagePrompt('p1', 'planning', 'override')

    expect(deleteColumn('planning', 'backlog')).toBe(true)

    expect(ids()).toEqual(['backlog', 'implementing', 'review', 'done'])
    const moved = useSdlcStore.getState().tickets.find((t) => t.id === 'a')
    expect(moved?.stage).toBe('backlog')
    expect(moved?.status).toBe('idle')
    expect(useSdlcStore.getState().tickets.find((t) => t.id === 'b')?.stage).toBe('review')
    expect(useSdlcPromptsStore.getState().promptsPerProject.p1.planning).toBeUndefined()
  })

  it('refuses while an agent is running in the column', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'planning', 'running')] })
    expect(deleteColumn('planning', 'backlog')).toBe(false)
    expect(ids()).toContain('planning')
  })

  it('refuses a target that does not exist', () => {
    expect(deleteColumn('planning', 'nowhere')).toBe(false)
    expect(ids()).toContain('planning')
  })
})

describe('resetFlow', () => {
  it('returns tickets in custom columns to the start and leaves the rest where they are', () => {
    const audit = useSdlcFlowStore.getState().addColumn('Audit', 'review')
    useSdlcStore.setState({ tickets: [ticket('a', audit.id), ticket('b', 'review')] })

    expect(resetFlow()).toBe(true)

    expect(ids()).toEqual(['backlog', 'planning', 'implementing', 'review', 'done'])
    expect(useSdlcStore.getState().tickets.map((t) => t.stage)).toEqual(['backlog', 'review'])
  })

  it('refuses while an agent runs in a column that would disappear', () => {
    const audit = useSdlcFlowStore.getState().addColumn('Audit', 'review')
    useSdlcStore.setState({ tickets: [ticket('a', audit.id, 'running')] })
    expect(resetFlow()).toBe(false)
    expect(ids()).toContain(audit.id)
  })
})

describe('data from before columns were configurable', () => {
  it('moves the three named outputs under the columns that wrote them', () => {
    const legacy = {
      ...ticket('a', 'review'),
      artifacts: { diffFiles: [], activity: [], plan: 'the plan', checkOutput: null, prSummary: 'lgtm' }
    } as unknown as SdlcTicket
    const upgraded = upgradeLegacyArtifacts(legacy)
    expect(upgraded.artifacts.outputs).toEqual({ planning: 'the plan', review: 'lgtm' })
    expect(upgraded.artifacts).not.toHaveProperty('plan')
  })

  it('leaves an already-upgraded ticket alone', () => {
    const current = { ...ticket('a', 'review'), artifacts: { ...EMPTY_ARTIFACTS, outputs: { review: 'x' } } }
    expect(upgradeLegacyArtifacts(current)).toBe(current)
  })

  it('rewrites the old plan variable in a stored prompt', () => {
    expect(upgradeLegacyPrompt('Follow {{plan}} on {{branch}}')).toBe('Follow {{output.planning}} on {{branch}}')
  })
})
