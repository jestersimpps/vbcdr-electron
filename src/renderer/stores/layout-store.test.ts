import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLayoutStore, DEFAULT_SPLIT, DEFAULT_TOKEN_CAP } from './layout-store'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'
import { DEFAULT_LLM_PROVIDER_ID } from '@/config/llm-provider-registry'

const resetStore = (): void => {
  useLayoutStore.setState({
    splitsPerProject: {},
    gitCollapsedPerProject: {},
    tokenCap: DEFAULT_TOKEN_CAP,
    idleSoundEnabled: false,
    idleSoundId: DEFAULT_IDLE_SOUND_ID,
    llmProviderId: DEFAULT_LLM_PROVIDER_ID,
    llmCustomCommand: '',
    globalTerminalCwd: '',
    resetVersion: 0
  })
}

async function importFresh(): Promise<typeof import('./layout-store')> {
  vi.resetModules()
  return import('./layout-store')
}

function seedPersisted(state: Record<string, unknown>, version?: number): void {
  localStorage.setItem(
    'vbcdr-layout',
    JSON.stringify(version === undefined ? { state } : { state, version })
  )
}

describe('layout-store', () => {
  beforeEach(resetStore)

  describe('getSplit / setSplit', () => {
    it('returns the default split for an unknown project', () => {
      expect(useLayoutStore.getState().getSplit('p1')).toBe(DEFAULT_SPLIT)
    })

    it('persists supplied split per project', () => {
      useLayoutStore.getState().setSplit('p1', 60)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(60)
      expect(useLayoutStore.getState().getSplit('p2')).toBe(DEFAULT_SPLIT)
    })

    it('clamps out-of-range values', () => {
      useLayoutStore.getState().setSplit('p1', 5)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(20)
      useLayoutStore.getState().setSplit('p1', 99)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(85)
    })

    it('falls back to default when given a non-finite size', () => {
      useLayoutStore.getState().setSplit('p1', NaN)
      expect(useLayoutStore.getState().getSplit('p1')).toBe(DEFAULT_SPLIT)
    })
  })

  describe('toggleGitCollapsed', () => {
    it('toggles per project without affecting others', () => {
      useLayoutStore.getState().toggleGitCollapsed('p1')
      expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(true)
      expect(useLayoutStore.getState().gitCollapsedPerProject.p2).toBeUndefined()

      useLayoutStore.getState().toggleGitCollapsed('p1')
      expect(useLayoutStore.getState().gitCollapsedPerProject.p1).toBe(false)
    })
  })

  describe('setGlobalTerminalCwd', () => {
    it('stores the trimmed path', () => {
      useLayoutStore.getState().setGlobalTerminalCwd('  /Users/me/dev  ')
      expect(useLayoutStore.getState().globalTerminalCwd).toBe('/Users/me/dev')
    })

    it('allows clearing back to empty', () => {
      useLayoutStore.getState().setGlobalTerminalCwd('/x')
      useLayoutStore.getState().setGlobalTerminalCwd('   ')
      expect(useLayoutStore.getState().globalTerminalCwd).toBe('')
    })
  })

  describe('resetLayout', () => {
    it('clears project-specific split and bumps resetVersion', () => {
      useLayoutStore.getState().setSplit('p1', 50)
      const before = useLayoutStore.getState().resetVersion
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.splitsPerProject.p1).toBeUndefined()
      expect(state.getSplit('p1')).toBe(DEFAULT_SPLIT)
      expect(state.resetVersion).toBe(before + 1)
    })

    it('clears the project git-collapse flag but leaves other projects alone', () => {
      useLayoutStore.getState().toggleGitCollapsed('p1')
      useLayoutStore.getState().toggleGitCollapsed('p2')
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.gitCollapsedPerProject.p1).toBeUndefined()
      expect(state.gitCollapsedPerProject.p2).toBe(true)
    })
  })

  describe('setTokenCap', () => {
    it('rounds positive finite numbers', () => {
      useLayoutStore.getState().setTokenCap(99_999.7)
      expect(useLayoutStore.getState().tokenCap).toBe(100_000)
    })

    it('falls back to default for invalid input', () => {
      useLayoutStore.getState().setTokenCap(0)
      expect(useLayoutStore.getState().tokenCap).toBe(DEFAULT_TOKEN_CAP)
      useLayoutStore.getState().setTokenCap(NaN)
      expect(useLayoutStore.getState().tokenCap).toBe(DEFAULT_TOKEN_CAP)
      useLayoutStore.getState().setTokenCap(-5)
      expect(useLayoutStore.getState().tokenCap).toBe(DEFAULT_TOKEN_CAP)
    })
  })

  describe('simple setters', () => {
    it('updates idle sound', () => {
      useLayoutStore.getState().setIdleSoundEnabled(true)
      useLayoutStore.getState().setIdleSoundId('chirp')
      const s = useLayoutStore.getState()
      expect(s.idleSoundEnabled).toBe(true)
      expect(s.idleSoundId).toBe('chirp')
    })
  })

  describe('llm provider', () => {
    it('defaults to claude', () => {
      expect(useLayoutStore.getState().llmProviderId).toBe('claude')
      expect(useLayoutStore.getState().getLlmStartupCommand()).toBe('claude')
    })

    it('resolves the command for the selected provider', () => {
      useLayoutStore.getState().setLlmProviderId('codex')
      expect(useLayoutStore.getState().getLlmStartupCommand()).toBe('codex')
    })

    it('resolves the custom command when custom is selected', () => {
      useLayoutStore.getState().setLlmProviderId('custom')
      useLayoutStore.getState().setLlmCustomCommand('  claude --resume  ')
      expect(useLayoutStore.getState().llmCustomCommand).toBe('claude --resume')
      expect(useLayoutStore.getState().getLlmStartupCommand()).toBe('claude --resume')
    })

    it('falls back to claude when custom is selected but blank', () => {
      useLayoutStore.getState().setLlmProviderId('custom')
      useLayoutStore.getState().setLlmCustomCommand('   ')
      expect(useLayoutStore.getState().getLlmStartupCommand()).toBe('claude')
    })
  })

  describe('persisted provider migration', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('defaults to claude when nothing is persisted', async () => {
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('claude')
    })

    it('migrates a legacy claude command', async () => {
      seedPersisted({ llmStartupCommand: 'claude' })
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('claude')
      expect(store.getState().llmCustomCommand).toBe('')
    })

    it('migrates a legacy codex command', async () => {
      seedPersisted({ llmStartupCommand: 'codex' })
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('codex')
    })

    it('migrates an unrecognised legacy command to custom, preserving it', async () => {
      seedPersisted({ llmStartupCommand: 'gemini --yolo' })
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('custom')
      expect(store.getState().llmCustomCommand).toBe('gemini --yolo')
      expect(store.getState().getLlmStartupCommand()).toBe('gemini --yolo')
    })

    it('migrates a flagged claude command to custom so flags survive', async () => {
      seedPersisted({ llmStartupCommand: 'claude --resume' })
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('custom')
      expect(store.getState().getLlmStartupCommand()).toBe('claude --resume')
    })

    it('keeps unrelated persisted layout state during migration', async () => {
      seedPersisted({ llmStartupCommand: 'codex', tokenCap: 12345 })
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().tokenCap).toBe(12345)
    })

    it('migrates a versionless payload, as written by pre-migration builds', async () => {
      localStorage.setItem(
        'vbcdr-layout',
        JSON.stringify({ state: { llmStartupCommand: 'codex' } })
      )
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('codex')
    })

    it('prefers an explicit provider id over a stale legacy command', async () => {
      seedPersisted({ llmProviderId: 'claude', llmStartupCommand: 'codex' }, 1)
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('claude')
    })

    it('leaves already-migrated state untouched', async () => {
      seedPersisted({ llmProviderId: 'codex', llmCustomCommand: '' }, 1)
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('codex')
    })

    it('falls back to claude for a corrupt persisted provider id', async () => {
      seedPersisted({ llmProviderId: 'nonsense' }, 1)
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().llmProviderId).toBe('claude')
    })
  })
})
