import { beforeEach, describe, expect, it } from 'vitest'
import { resolveStagePrompt, useSdlcPromptsStore } from './sdlc-prompts-store'
import { useLayoutStore } from './layout-store'
import { DEFAULT_SDLC_STAGE_PROMPTS } from '@/models/sdlc-prompts'

beforeEach(() => {
  useSdlcPromptsStore.setState({ promptsPerProject: {} })
  useLayoutStore.setState({ sdlcStagePrompts: { ...DEFAULT_SDLC_STAGE_PROMPTS } })
})

describe('resolveStagePrompt', () => {
  it('inherits the global prompt when the project has no override', () => {
    useLayoutStore.getState().setSdlcStagePrompt('planning', 'global planning')
    expect(resolveStagePrompt('p1', 'planning')).toEqual({ text: 'global planning', overridden: false })
  })

  it('follows later global edits while inheriting', () => {
    expect(resolveStagePrompt('p1', 'review').text).toBe(DEFAULT_SDLC_STAGE_PROMPTS.review)
    useLayoutStore.getState().setSdlcStagePrompt('review', 'stricter review')
    expect(resolveStagePrompt('p1', 'review').text).toBe('stricter review')
  })

  it('prefers a project override and flags it', () => {
    useSdlcPromptsStore.getState().setStagePrompt('p1', 'planning', 'use pnpm')
    expect(resolveStagePrompt('p1', 'planning')).toEqual({ text: 'use pnpm', overridden: true })
    expect(resolveStagePrompt('p2', 'planning').overridden).toBe(false)
  })

  it('counts an override equal to the global text as overridden (presence, not equality)', () => {
    useSdlcPromptsStore.getState().setStagePrompt('p1', 'planning', DEFAULT_SDLC_STAGE_PROMPTS.planning)
    expect(resolveStagePrompt('p1', 'planning').overridden).toBe(true)
  })

  it('clearing an override returns the stage to inherited without touching the others', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p1', 'review', 'b')
    store.clearStagePrompt('p1', 'planning')
    expect(resolveStagePrompt('p1', 'planning').overridden).toBe(false)
    expect(resolveStagePrompt('p1', 'review')).toEqual({ text: 'b', overridden: true })
  })

  it('treats a blank override as a clear', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p1', 'planning', '   ')
    expect(resolveStagePrompt('p1', 'planning').overridden).toBe(false)
  })

  it('drops every override for a removed project', () => {
    const store = useSdlcPromptsStore.getState()
    store.setStagePrompt('p1', 'planning', 'a')
    store.setStagePrompt('p2', 'planning', 'c')
    store.removeProjectState('p1')
    expect(useSdlcPromptsStore.getState().promptsPerProject.p1).toBeUndefined()
    expect(resolveStagePrompt('p2', 'planning').text).toBe('c')
  })
})

describe('global prompt defaults', () => {
  it('falls back to the built-in text when a global prompt is blanked', () => {
    useLayoutStore.getState().setSdlcStagePrompt('implementing', '')
    expect(resolveStagePrompt('p1', 'implementing').text).toBe(DEFAULT_SDLC_STAGE_PROMPTS.implementing)
  })

  it('reset restores the built-in text for one stage only', () => {
    const layout = useLayoutStore.getState()
    layout.setSdlcStagePrompt('planning', 'x')
    layout.setSdlcStagePrompt('review', 'y')
    layout.resetSdlcStagePrompt('planning')
    const prompts = useLayoutStore.getState().sdlcStagePrompts
    expect(prompts.planning).toBe(DEFAULT_SDLC_STAGE_PROMPTS.planning)
    expect(prompts.review).toBe('y')
  })
})
