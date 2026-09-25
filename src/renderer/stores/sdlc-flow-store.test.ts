import { beforeEach, describe, expect, it } from 'vitest'
import { sdlcColumns, upgradeLegacyPrompt, useSdlcFlowStore } from './sdlc-flow-store'
import { upgradeLegacyArtifacts, useSdlcStore } from './sdlc-store'
import { useSdlcPromptsStore } from './sdlc-prompts-store'
import { deleteColumn, deleteFlow, resetFlow, switchProjectFlow } from '@/lib/sdlc-flow'
import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'
import { threeStageFlowState } from '@/models/sdlc-flow.fixtures'
import { DEFAULT_FLOW_ID } from '@/models/sdlc-flow'

function ids(): string[] {
  return sdlcColumns('p1').map((c) => c.id)
}

function ticket(id: string, stage: string, status: SdlcTicket['status'] = 'idle'): SdlcTicket {
  return { ...useSdlcStore.getState().createTicket({ projectId: 'p1', description: id, attachments: [] }), id, stage, status }
}

beforeEach(() => {
  useSdlcFlowStore.setState(threeStageFlowState())
  useSdlcStore.setState({ tickets: [] })
  useSdlcPromptsStore.setState({ promptsPerProject: {} })
})

describe('sdlc flow store', () => {
  it('adds a column before the given one, never outside the fixed ends', () => {
    const flow = useSdlcFlowStore.getState()
    flow.addColumn(DEFAULT_FLOW_ID, 'Audit', 'review')
    expect(ids()).toEqual(['backlog', 'planning', 'implementing', 'audit', 'review', 'done'])
    flow.addColumn(DEFAULT_FLOW_ID, 'Triage', 'backlog')
    expect(ids()[0]).toBe('backlog')
    expect(ids()[1]).toBe('triage')
    flow.addColumn(DEFAULT_FLOW_ID, 'Nowhere', 'missing')
    expect(ids()[ids().length - 1]).toBe('done')
  })

  it('gives a new column the handover template, reading the agent columns to its left', () => {
    const column = useSdlcFlowStore.getState().addColumn(DEFAULT_FLOW_ID, 'Audit', 'review')
    expect(column.prompt).toContain('{{output.planning}}')
    expect(column.prompt).toContain('{{output.implementing}}')
    expect(column.prompt).not.toContain('{{output.review}}')
    expect(column.prompt).toContain('{{diff}}')
  })

  it('keeps the id when a column is renamed, so tickets and prompt variables still find it', () => {
    const flow = useSdlcFlowStore.getState()
    const column = flow.addColumn(DEFAULT_FLOW_ID, 'Audit', 'review')
    flow.updateColumn(DEFAULT_FLOW_ID, column.id, { label: 'Security audit' })
    expect(sdlcColumns('p1').find((c) => c.id === 'audit')?.label).toBe('Security audit')
  })

  it('reorders only among the middle columns', () => {
    const flow = useSdlcFlowStore.getState()
    flow.reorderColumn(DEFAULT_FLOW_ID, 'planning', 3)
    expect(ids()).toEqual(['backlog', 'implementing', 'review', 'planning', 'done'])
    flow.reorderColumn(DEFAULT_FLOW_ID, 'planning', 0)
    flow.reorderColumn(DEFAULT_FLOW_ID, 'planning', 4)
    flow.reorderColumn(DEFAULT_FLOW_ID, 'backlog', 2)
    flow.reorderColumn(DEFAULT_FLOW_ID, 'done', 1)
    expect(ids()).toEqual(['backlog', 'implementing', 'review', 'planning', 'done'])
  })

  it('keeps every column between the ends an agent, since nothing would move a ticket out of a human one', () => {
    useSdlcFlowStore.getState().updateColumn(DEFAULT_FLOW_ID, 'planning', { kind: 'human' })
    expect(sdlcColumns('p1')[1].kind).toBe('agent')
  })

  it('refuses to remove or retype the ends', () => {
    const flow = useSdlcFlowStore.getState()
    flow.removeColumn(DEFAULT_FLOW_ID, 'backlog')
    flow.removeColumn(DEFAULT_FLOW_ID, 'done')
    flow.updateColumn(DEFAULT_FLOW_ID, 'backlog', { kind: 'agent' })
    flow.updateColumn(DEFAULT_FLOW_ID, 'done', { kind: 'human' })
    const columns = sdlcColumns('p1')
    expect(columns).toHaveLength(5)
    expect(columns[0].kind).toBe('human')
    expect(columns[4].kind).toBe('terminal')
  })
})

describe('deleteColumn', () => {
  it('moves the tickets out idle, then removes the column and its project overrides', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'planning', 'blocked'), ticket('b', 'review')] })
    useSdlcPromptsStore.getState().setStagePrompt('p1', 'planning', 'override')

    expect(deleteColumn(DEFAULT_FLOW_ID, 'planning', 'backlog')).toBe(true)

    expect(ids()).toEqual(['backlog', 'implementing', 'review', 'done'])
    const moved = useSdlcStore.getState().tickets.find((t) => t.id === 'a')
    expect(moved?.stage).toBe('backlog')
    expect(moved?.status).toBe('idle')
    expect(useSdlcStore.getState().tickets.find((t) => t.id === 'b')?.stage).toBe('review')
    expect(useSdlcPromptsStore.getState().promptsPerProject.p1.planning).toBeUndefined()
  })

  it('refuses while an agent is running in the column', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'planning', 'running')] })
    expect(deleteColumn(DEFAULT_FLOW_ID, 'planning', 'backlog')).toBe(false)
    expect(ids()).toContain('planning')
  })

  it('refuses a target that does not exist', () => {
    expect(deleteColumn(DEFAULT_FLOW_ID, 'planning', 'nowhere')).toBe(false)
    expect(ids()).toContain('planning')
  })
})

describe('resetFlow', () => {
  it('returns tickets in columns the default flow lacks to the start and leaves the rest where they are', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'review'), ticket('b', 'done')] })

    expect(resetFlow(DEFAULT_FLOW_ID)).toBe(true)

    expect(ids()).toEqual(['backlog', 'build', 'done'])
    expect(useSdlcStore.getState().tickets.map((t) => t.stage)).toEqual(['backlog', 'done'])
  })

  it('refuses while an agent runs in a column that would disappear', () => {
    const audit = useSdlcFlowStore.getState().addColumn(DEFAULT_FLOW_ID, 'Audit', 'review')
    useSdlcStore.setState({ tickets: [ticket('a', audit.id, 'running')] })
    expect(resetFlow(DEFAULT_FLOW_ID)).toBe(false)
    expect(ids()).toContain(audit.id)
  })
})

describe('saved flows', () => {
  function saveBuildOnly(): string {
    const flow = useSdlcFlowStore.getState().saveFlowAs(DEFAULT_FLOW_ID, 'Build only')
    useSdlcFlowStore.getState().resetColumns(flow.id)
    return flow.id
  }

  it('saves a copy that edits independently of the flow it came from', () => {
    const copy = useSdlcFlowStore.getState().saveFlowAs(DEFAULT_FLOW_ID, 'Careful')
    expect(copy.id).toBe('careful')
    useSdlcFlowStore.getState().updateColumn(copy.id, 'planning', { label: 'Think' })

    expect(sdlcColumns('p1')[1].label).toBe('Planning')
    expect(useSdlcFlowStore.getState().flows.find((f) => f.id === 'careful')?.columns[1].label).toBe('Think')
  })

  it('never reuses a flow id, even for the name of the default one', () => {
    expect(useSdlcFlowStore.getState().saveFlowAs(DEFAULT_FLOW_ID, 'Default').id).toBe('default-2')
  })

  it('gives each project the columns of the flow it picked, and the default flow otherwise', () => {
    const flowId = saveBuildOnly()
    expect(switchProjectFlow('p1', flowId)).toBe(true)

    expect(ids()).toEqual(['backlog', 'build', 'done'])
    expect(sdlcColumns('p2').map((c) => c.id)).toEqual(['backlog', 'planning', 'implementing', 'review', 'done'])
  })

  it('starts a switching project over in the new flow only for columns it lacks, leaving other projects alone', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'review'), ticket('b', 'done'), { ...ticket('c', 'review'), projectId: 'p2' }] })

    switchProjectFlow('p1', saveBuildOnly())

    expect(useSdlcStore.getState().tickets.map((t) => t.stage)).toEqual(['backlog', 'done', 'review'])
  })

  it('refuses to switch while an agent runs in a column the new flow lacks', () => {
    useSdlcStore.setState({ tickets: [ticket('a', 'review', 'running')] })
    const flowId = saveBuildOnly()

    expect(switchProjectFlow('p1', flowId)).toBe(false)
    expect(ids()).toContain('review')
  })

  it('deletes a column only for the projects on that flow', () => {
    const flowId = useSdlcFlowStore.getState().saveFlowAs(DEFAULT_FLOW_ID, 'Other').id
    switchProjectFlow('p2', flowId)
    useSdlcStore.setState({ tickets: [ticket('a', 'review'), { ...ticket('b', 'review'), projectId: 'p2' }] })

    expect(deleteColumn(flowId, 'review', 'implementing')).toBe(true)

    expect(ids()).toContain('review')
    expect(useSdlcStore.getState().tickets.map((t) => t.stage)).toEqual(['review', 'implementing'])
  })

  it('moves the projects of a deleted flow back to the default one, and keeps the default flow', () => {
    const flowId = saveBuildOnly()
    switchProjectFlow('p1', flowId)

    expect(deleteFlow(DEFAULT_FLOW_ID)).toBe(false)
    expect(deleteFlow(flowId)).toBe(true)

    expect(useSdlcFlowStore.getState().flows.map((f) => f.id)).toEqual([DEFAULT_FLOW_ID])
    expect(ids()).toEqual(['backlog', 'planning', 'implementing', 'review', 'done'])
  })

  it('turns the single stored flow from before flows could be saved into the default one', async () => {
    useSdlcFlowStore.setState({ flows: [], flowPerProject: {} })
    localStorage.setItem('vbcdr-sdlc-flow', JSON.stringify({ state: { columns: threeStageFlowState().flows[0].columns }, version: 0 }))

    await useSdlcFlowStore.persist.rehydrate()

    const { flows } = useSdlcFlowStore.getState()
    expect(flows.map((f) => f.id)).toEqual([DEFAULT_FLOW_ID])
    expect(ids()).toEqual(['backlog', 'planning', 'implementing', 'review', 'done'])
    localStorage.removeItem('vbcdr-sdlc-flow')
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

describe('auto-start', () => {
  it('is on by default and survives being switched off', () => {
    expect(useSdlcFlowStore.getState().autoStart).toBe(true)
    useSdlcFlowStore.getState().setAutoStart(false)
    expect(useSdlcFlowStore.getState().autoStart).toBe(false)
    expect(JSON.parse(localStorage.getItem('vbcdr-sdlc-flow')!).state.autoStart).toBe(false)
    useSdlcFlowStore.getState().setAutoStart(true)
  })
})
