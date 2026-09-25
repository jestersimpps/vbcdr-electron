import { beforeEach, describe, expect, it } from 'vitest'
import { resolveStagePrompt, useSdlcPromptsStore } from './sdlc-prompts-store'
import { useSdlcFlowStore } from './sdlc-flow-store'
import { DEFAULT_SDLC_STAGE_PROMPTS } from '@/models/sdlc-prompts'
import { threeStageFlowState } from '@/models/sdlc-flow.fixtures'
import { DEFAULT_FLOW_ID } from '@/models/sdlc-flow'

beforeEach(() => {
  useSdlcPromptsStore.setState({ promptsPerProject: {} })
  useSdlcFlowStore.setState(threeStageFlowState())
})

describe('resolveStagePrompt', () => {
  it('inherits the global prompt when the project has no override', () => {
    useSdlcFlowStore.getState().updateColumn(DEFAULT_FLOW_ID, 'planning', { prompt: 'global planning' })
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'planning')).toEqual({ text: 'global planning', overridden: false })
  })

  it('follows later global edits while inheriting', () => {
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'review').text).toBe(DEFAULT_SDLC_STAGE_PROMPTS.review)
    useSdlcFlowStore.getState().updateColumn(DEFAULT_FLOW_ID, 'review', { prompt: 'stricter review' })
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'review').text).toBe('stricter review')
  })

  it('prefers a project override and flags it', () => {
    useSdlcPromptsStore.getState().setStagePrompt('p1', 'planning', 'use pnpm')
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'planning')).toEqual({ text: 'use pnpm', overridden: true })
    expect(resolveStagePrompt('p2', DEFAULT_FLOW_ID, 'planning').overridden).toBe(false)
  })

  it('counts an override equal to the global text as overridden (presence, not equality)', () => {
    useSdlcPromptsStore.getState().setStagePrompt('p1', 'planning', DEFAULT_SDLC_STAGE_PROMPTS.planning)
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'planning').overridden).toBe(true)
  })

  it('clearing an override returns the stage to inherited without touching the others', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p1', 'review', 'b')
    store.clearStagePrompt('p1', 'planning')
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'planning').overridden).toBe(false)
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'review')).toEqual({ text: 'b', overridden: true })
  })

  it('treats a blank override as a clear', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p1', 'planning', '   ')
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'planning').overridden).toBe(false)
  })

  it('drops every override for a removed project', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p2', 'planning', 'c')
    store.removeProjectState('p1')
    expect(useSdlcPromptsStore.getState().promptsPerProject.p1).toBeUndefined()
    expect(resolveStagePrompt('p2', DEFAULT_FLOW_ID, 'planning').text).toBe('c')
  })
})

describe('column prompts', () => {
  it('resolves a custom column to its own prompt', () => {
    const column = useSdlcFlowStore.getState().addColumn(DEFAULT_FLOW_ID, 'Security audit', 'review')
    useSdlcFlowStore.getState().updateColumn(DEFAULT_FLOW_ID, column.id, { prompt: 'audit it' })
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, column.id)).toEqual({ text: 'audit it', overridden: false })
  })

  it('drops every project override for a removed column', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p1', 'review', 'b')
    store.removeColumnState('planning', () => true)
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'planning').overridden).toBe(false)
    expect(resolveStagePrompt('p1', DEFAULT_FLOW_ID, 'review')).toEqual({ text: 'b', overridden: true })
  })
})
