import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLayoutStore, DEFAULT_SPLIT, DEFAULT_TOKEN_CAP, DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT } from './layout-store'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'
import { DEFAULT_LLM_PROVIDER_ID } from '@/config/llm-provider-registry'
import { DEFAULT_BUILTIN_PROFILE_COLORS, defaultCustomProfiles } from '@/config/terminal-profiles'

const resetStore = (): void => {
  useLayoutStore.setState({
    splitsPerProject: {},
    gitCollapsedPerProject: {},
    devTerminalsCollapsedPerProject: {},
    tokenCap: DEFAULT_TOKEN_CAP,
    idleSoundEnabled: false,
    idleSoundId: DEFAULT_IDLE_SOUND_ID,
    llmProviderId: DEFAULT_LLM_PROVIDER_ID,
    llmCustomCommand: '',
    builtinProfileColors: { ...DEFAULT_BUILTIN_PROFILE_COLORS },
    hiddenBuiltinProfileIds: [],
    defaultTerminalProfileId: 'claude',
    customProfiles: defaultCustomProfiles(),
    globalTerminalCwd: '',
    useWorktreesForNewLlmTabs: false,
    closeTabWorkflowPrompt: DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT,
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

  describe('toggleDevTerminalsCollapsed', () => {
    it('toggles per project without affecting others', () => {
      useLayoutStore.getState().toggleDevTerminalsCollapsed('p1')
      expect(useLayoutStore.getState().devTerminalsCollapsedPerProject.p1).toBe(true)
      expect(useLayoutStore.getState().devTerminalsCollapsedPerProject.p2).toBeUndefined()

      useLayoutStore.getState().toggleDevTerminalsCollapsed('p1')
      expect(useLayoutStore.getState().devTerminalsCollapsedPerProject.p1).toBe(false)
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

    it('clears the project dev-terminals-collapse flag but leaves other projects alone', () => {
      useLayoutStore.getState().toggleDevTerminalsCollapsed('p1')
      useLayoutStore.getState().toggleDevTerminalsCollapsed('p2')
      useLayoutStore.getState().resetLayout('p1')
      const state = useLayoutStore.getState()
      expect(state.devTerminalsCollapsedPerProject.p1).toBeUndefined()
      expect(state.devTerminalsCollapsedPerProject.p2).toBe(true)
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

  describe('useWorktreesForNewLlmTabs', () => {
    it('defaults to off', () => {
      expect(useLayoutStore.getState().useWorktreesForNewLlmTabs).toBe(false)
    })

    it('toggles via the setter', () => {
      useLayoutStore.getState().setUseWorktreesForNewLlmTabs(true)
      expect(useLayoutStore.getState().useWorktreesForNewLlmTabs).toBe(true)
    })

    it('falls back to false when the persisted value is not a boolean', async () => {
      seedPersisted({ useWorktreesForNewLlmTabs: 'yes' }, 1)
      const mod = await importFresh()
      expect(mod.useLayoutStore.getState().useWorktreesForNewLlmTabs).toBe(false)
    })

    it('restores a persisted true', async () => {
      seedPersisted({ useWorktreesForNewLlmTabs: true }, 1)
      const mod = await importFresh()
      expect(mod.useLayoutStore.getState().useWorktreesForNewLlmTabs).toBe(true)
    })
  })

  describe('closeTabWorkflowPrompt', () => {
    it('defaults to the built-in prompt', () => {
      expect(useLayoutStore.getState().closeTabWorkflowPrompt).toBe(DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT)
    })

    it('stores a trimmed custom prompt and resets back to the default', () => {
      useLayoutStore.getState().setCloseTabWorkflowPrompt('  push it  ')
      expect(useLayoutStore.getState().closeTabWorkflowPrompt).toBe('push it')
      useLayoutStore.getState().resetCloseTabWorkflowPrompt()
      expect(useLayoutStore.getState().closeTabWorkflowPrompt).toBe(DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT)
    })

    it('falls back to the default when set to whitespace', () => {
      useLayoutStore.getState().setCloseTabWorkflowPrompt('   ')
      expect(useLayoutStore.getState().closeTabWorkflowPrompt).toBe(DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT)
    })

    it('ignores a persisted empty prompt', async () => {
      seedPersisted({ closeTabWorkflowPrompt: '' }, 1)
      const mod = await importFresh()
      expect(mod.useLayoutStore.getState().closeTabWorkflowPrompt).toBe(mod.DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT)
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

  describe('terminal profiles', () => {
    it('starts with built-in profiles and no custom profiles', () => {
      const { builtinProfileColors, customProfiles, getTerminalProfiles } = useLayoutStore.getState()
      expect(builtinProfileColors).toEqual(DEFAULT_BUILTIN_PROFILE_COLORS)
      expect(customProfiles).toEqual(defaultCustomProfiles())
      expect(getTerminalProfiles().map((p) => p.id)).toEqual(['claude', 'codex'])
    })

    it('setBuiltinProfileColor accepts only valid hex', () => {
      useLayoutStore.getState().setBuiltinProfileColor('codex', '#123456')
      useLayoutStore.getState().setBuiltinProfileColor('claude', 'purple')
      expect(useLayoutStore.getState().builtinProfileColors).toEqual({
        claude: DEFAULT_BUILTIN_PROFILE_COLORS.claude,
        codex: '#123456'
      })
    })

    it('adds, updates, and removes a custom profile', () => {
      const id = useLayoutStore.getState().addCustomProfile()
      useLayoutStore.getState().updateCustomProfile(id, { label: ' Opus ', command: ' claude --model opus ', color: '#abcdef' })
      useLayoutStore.getState().updateCustomProfile(id, { label: '   ', color: 'bad' })
      expect(useLayoutStore.getState().customProfiles).toEqual([
        { id, label: 'Opus', color: '#abcdef', command: 'claude --model opus' }
      ])
      expect(useLayoutStore.getState().getTerminalProfile(id).providerId).toBe('claude')
      useLayoutStore.getState().removeCustomProfile(id)
      expect(useLayoutStore.getState().customProfiles).toEqual([])
    })

    it('resetCustomProfile clears one profile without affecting another', () => {
      const oneId = useLayoutStore.getState().addCustomProfile()
      const twoId = useLayoutStore.getState().addCustomProfile()
      useLayoutStore.getState().updateCustomProfile(oneId, { command: 'gemini' })
      useLayoutStore.getState().updateCustomProfile(twoId, { command: 'aider' })
      useLayoutStore.getState().resetCustomProfile(oneId)
      const [one, two] = useLayoutStore.getState().customProfiles
      expect(one).toMatchObject({ id: oneId, label: 'Custom 1', color: '#60a5fa', command: '' })
      expect(two.command).toBe('aider')
    })

    it('getProfileStartupCommand keeps custom flags as typed', () => {
      expect(useLayoutStore.getState().getProfileStartupCommand('claude')).toBe('claude')
      expect(useLayoutStore.getState().getProfileStartupCommand('codex')).toBe('codex')
      const claudeId = useLayoutStore.getState().addCustomProfile()
      const geminiId = useLayoutStore.getState().addCustomProfile()
      useLayoutStore.getState().updateCustomProfile(claudeId, { command: 'claude --model opus' })
      useLayoutStore.getState().updateCustomProfile(geminiId, { command: 'gemini' })
      expect(useLayoutStore.getState().getProfileStartupCommand(claudeId)).toBe('claude --model opus')
      expect(useLayoutStore.getState().getProfileStartupCommand(geminiId)).toBe('gemini')
      expect(useLayoutStore.getState().getProfileStartupCommand('codex')).toBe('codex')
    })

    it('getDefaultProfileId maps the built-in providers and returns null for custom', () => {
      expect(useLayoutStore.getState().getDefaultProfileId()).toBe('claude')
      useLayoutStore.getState().setLlmProviderId('codex')
      expect(useLayoutStore.getState().getDefaultProfileId()).toBe('codex')
      useLayoutStore.getState().setLlmProviderId('custom')
      expect(useLayoutStore.getState().getDefaultProfileId()).toBeNull()
    })

    it('removes and restores built-in profiles and replaces a removed default', () => {
      useLayoutStore.getState().removeBuiltinProfile('claude')
      expect(useLayoutStore.getState().hiddenBuiltinProfileIds).toEqual(['claude'])
      expect(useLayoutStore.getState().getTerminalProfiles().map((profile) => profile.id)).toEqual(['codex'])
      expect(useLayoutStore.getState().getDefaultProfileId()).toBe('codex')
      expect(useLayoutStore.getState().llmProviderId).toBe('codex')

      useLayoutStore.getState().restoreBuiltinProfile('claude')
      expect(useLayoutStore.getState().getTerminalProfiles().map((profile) => profile.id)).toEqual(['claude', 'codex'])
      expect(useLayoutStore.getState().getDefaultProfileId()).toBe('codex')
    })

    it('allows a configured custom profile to become the default', () => {
      const id = useLayoutStore.getState().addCustomProfile()
      useLayoutStore.getState().updateCustomProfile(id, { label: 'Opus', command: 'claude --model opus' })
      useLayoutStore.getState().setDefaultTerminalProfileId(id)
      expect(useLayoutStore.getState().getDefaultProfileId()).toBe(id)
      expect(useLayoutStore.getState().getLlmStartupCommand()).toBe('claude --model opus')
      expect(useLayoutStore.getState().llmProviderId).toBe('claude')
    })

    it('falls back to another profile when the default custom command is cleared', () => {
      const id = useLayoutStore.getState().addCustomProfile()
      useLayoutStore.getState().updateCustomProfile(id, { command: 'gemini' })
      useLayoutStore.getState().setDefaultTerminalProfileId(id)
      useLayoutStore.getState().updateCustomProfile(id, { command: '' })
      expect(useLayoutStore.getState().getDefaultProfileId()).toBe('claude')
      expect(useLayoutStore.getState().getLlmStartupCommand()).toBe('claude')
    })

    it('repairs persisted profile data on load', async () => {
      seedPersisted(
        {
          builtinProfileColors: { claude: '#010203', codex: 'nope' },
          customProfiles: [{ id: 'custom-3', label: 'Gemini', color: '#abcdef', command: 'gemini' }, 'junk']
        },
        1
      )
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().builtinProfileColors).toEqual({ claude: '#010203', codex: DEFAULT_BUILTIN_PROFILE_COLORS.codex })
      const customs = store.getState().customProfiles
      expect(customs).toEqual([{ id: 'custom-3', label: 'Gemini', color: '#abcdef', command: 'gemini' }])
    })

    it('keeps an explicitly empty profile list after reload', async () => {
      seedPersisted({ customProfiles: [] }, 2)
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().customProfiles).toEqual([])
      expect(store.getState().getTerminalProfiles().map((profile) => profile.id)).toEqual(['claude', 'codex'])
    })

    it('removes untouched V1 placeholder slots while preserving configured profiles', async () => {
      seedPersisted({
        customProfiles: [
          { id: 'custom-1', label: 'Custom 1', color: '#60a5fa', command: '' },
          { id: 'custom-2', label: 'Opus', color: '#c084fc', command: 'claude --model opus' },
          { id: 'custom-3', label: 'Custom 3', color: '#f472b6', command: '' }
        ]
      }, 1)
      const { useLayoutStore: store } = await importFresh()
      expect(store.getState().customProfiles).toEqual([
        { id: 'custom-2', label: 'Opus', color: '#c084fc', command: 'claude --model opus' }
      ])
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
