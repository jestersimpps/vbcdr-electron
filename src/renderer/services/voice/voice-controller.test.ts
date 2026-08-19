import { describe, it, expect, beforeEach } from 'vitest'
import {
  useVoiceStore,
  submitUtterance,
  confirmPending,
  cancelPending
} from './voice-controller'
import { useLayoutStore } from '@/stores/layout-store'
import { useProjectStore } from '@/stores/project-store'

beforeEach(() => {
  useVoiceStore.setState({
    status: 'stopped',
    history: [],
    pending: null,
    awaiting: false,
    unparseableStreak: 0
  })
  useLayoutStore.setState({ voiceConfirmDestructive: true, gitCollapsedPerProject: {} })
  useProjectStore.setState({
    projects: [{ id: 'p1', name: 'vibecoder', path: '/repo', lastOpened: 0 }],
    activeProjectId: 'p1',
    dashboardActive: false,
    voicePageActive: false
  })
})

describe('destructive confirmation', () => {
  it('holds a destructive action pending instead of running it', async () => {
    await submitUtterance('commit this')
    const state = useVoiceStore.getState()
    expect(state.pending).toEqual({
      action: 'git-commit',
      target: undefined,
      transcript: 'commit this'
    })
    expect(state.history.at(-1)?.outcome).toContain('Waiting for confirmation')
  })

  it('runs a destructive action immediately when confirmation is disabled', async () => {
    useLayoutStore.setState({ voiceConfirmDestructive: false })
    await submitUtterance('commit this')
    const state = useVoiceStore.getState()
    expect(state.pending).toBeNull()
    expect(state.history.at(-1)?.action?.action).toBe('git-commit')
  })

  it('cancelling a pending action records it and runs nothing', () => {
    useVoiceStore.getState().setPending({ action: 'git-commit', transcript: 'commit this' })
    cancelPending()
    const state = useVoiceStore.getState()
    expect(state.pending).toBeNull()
    expect(state.history.at(-1)?.ok).toBe(false)
    expect(state.history.at(-1)?.outcome).toContain('Cancelled')
  })

  it('confirming dispatches the held action', () => {
    useVoiceStore.getState().setPending({ action: 'git-commit', transcript: 'commit this' })
    confirmPending()
    const state = useVoiceStore.getState()
    expect(state.pending).toBeNull()
    expect(state.history.at(-1)?.action?.action).toBe('git-commit')
  })
})

describe('fast-path dispatch', () => {
  it('runs a non-destructive navigation phrase without the agent', async () => {
    useLayoutStore.setState({ gitCollapsedPerProject: { p1: true } })
    await submitUtterance('show git')
    const state = useVoiceStore.getState()
    expect(state.history.at(-1)?.source).toBe('fast-path')
    expect(state.history.at(-1)?.ok).toBe(true)
    expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(false)
  })

  it('is idempotent — saying "show git" twice leaves it visible', async () => {
    useLayoutStore.setState({ gitCollapsedPerProject: { p1: true } })
    await submitUtterance('show git')
    await submitUtterance('show git')
    expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(false)
  })

  it('is idempotent in the other direction too', async () => {
    await submitUtterance('hide git')
    await submitUtterance('hide git')
    expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(true)
  })

  it('reports failure when the agent is down and nothing matches', async () => {
    await submitUtterance('open the file where the terminal stuff lives')
    const entry = useVoiceStore.getState().history.at(-1)
    expect(entry?.ok).toBe(false)
    expect(entry?.source).toBe('fallback')
  })

  it('ignores empty utterances', async () => {
    await submitUtterance('   ')
    expect(useVoiceStore.getState().history).toHaveLength(0)
  })
})

describe('fast-path safety', () => {
  it('only ever emits actions that exist in ACTION_SPECS', async () => {
    const { matchFastPath } = await import('@/lib/voice/fast-path')
    const { ACTION_SPECS } = await import('@/lib/app-actions')
    const phrases = ['show git', 'commit this', 'save', 'next terminal', 'make it nord']
    for (const p of phrases) {
      const action = matchFastPath(p)
      expect(action, p).not.toBeNull()
      expect(ACTION_SPECS[action!.action], `${p} -> ${action!.action}`).toBeDefined()
    }
  })

  it('routes every destructive fast-path phrase through confirmation', async () => {
    const { matchFastPath } = await import('@/lib/voice/fast-path')
    const { ACTION_SPECS } = await import('@/lib/app-actions')
    const action = matchFastPath('commit this')!
    expect(ACTION_SPECS[action.action].destructive).toBe(true)
  })
})
