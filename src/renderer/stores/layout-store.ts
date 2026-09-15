import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'
import { DEFAULT_COMPANION_VOICE } from '@/config/companion-voices'
import {
  DEFAULT_CHATTINESS,
  CHATTINESS_LEVELS,
  type CompanionChattiness
} from '@/lib/companion-triggers'
import {
  DEFAULT_LLM_PROVIDER_ID,
  appendCompanionPrompt,
  isLlmProviderId,
  providerIdForCommand,
  resolveStartupCommand,
  supportsVoiceAgent,
  type LlmProviderId
} from '@/config/llm-provider-registry'
import {
  DEFAULT_BUILTIN_PROFILE_COLORS,
  buildTerminalProfiles,
  defaultCustomProfiles,
  isValidHexColor,
  sanitizeBuiltinProfileColors,
  sanitizeCustomProfiles,
  type BuiltinProfileId,
  type CustomProfileId,
  type CustomTerminalProfile,
  type TerminalProfile,
  type TerminalProfileId
} from '@/config/terminal-profiles'

export const DEFAULT_SPLIT = 75

interface LayoutState {
  splitsPerProject: Record<string, number>
  gitCollapsedPerProject: Record<string, boolean>
  devTerminalsCollapsedPerProject: Record<string, boolean>
  tokenCap: number
  idleSoundEnabled: boolean
  idleSoundId: string
  llmProviderId: LlmProviderId
  llmCustomCommand: string
  builtinProfileColors: Record<BuiltinProfileId, string>
  customProfiles: CustomTerminalProfile[]
  globalTerminalCwd: string
  useWorktreesForNewLlmTabs: boolean
  closeTabWorkflowPrompt: string
  resetVersion: number
  setBuiltinProfileColor: (id: BuiltinProfileId, color: string) => void
  updateCustomProfile: (id: CustomProfileId, patch: Partial<Omit<CustomTerminalProfile, 'id'>>) => void
  resetCustomProfile: (id: CustomProfileId) => void
  getTerminalProfiles: () => TerminalProfile[]
  getTerminalProfile: (id: TerminalProfileId) => TerminalProfile
  getProfileStartupCommand: (id: TerminalProfileId) => string
  getDefaultProfileId: () => TerminalProfileId | null
  getSplit: (projectId: string) => number
  setSplit: (projectId: string, size: number) => void
  setGitCollapsed: (projectId: string, collapsed: boolean) => void
  toggleGitCollapsed: (projectId: string) => void
  setDevTerminalsCollapsed: (projectId: string, collapsed: boolean) => void
  toggleDevTerminalsCollapsed: (projectId: string) => void
  voiceEnabled: boolean
  voiceAgentProviderId: LlmProviderId | null
  voiceAgentCustomCommand: string
  voiceVadSilenceMs: number
  voiceConfirmDestructive: boolean
  companionEnabled: boolean
  companionPromptPath: string | null
  companionSpeechEnabled: boolean
  companionVoiceId: string
  companionChattiness: CompanionChattiness
  setCompanionEnabled: (enabled: boolean) => void
  setCompanionPromptPath: (path: string | null) => void
  setCompanionSpeechEnabled: (enabled: boolean) => void
  setCompanionVoiceId: (id: string) => void
  setCompanionChattiness: (level: CompanionChattiness) => void
  setVoiceEnabled: (enabled: boolean) => void
  setVoiceAgentProviderId: (id: LlmProviderId | null) => void
  setVoiceAgentCustomCommand: (cmd: string) => void
  setVoiceVadSilenceMs: (ms: number) => void
  setVoiceConfirmDestructive: (enabled: boolean) => void
  getVoiceAgentProviderId: () => LlmProviderId
  getVoiceAgentCommand: () => string
  resetLayout: (projectId: string) => void
  setTokenCap: (cap: number) => void
  setIdleSoundEnabled: (enabled: boolean) => void
  setIdleSoundId: (id: string) => void
  setLlmProviderId: (id: LlmProviderId) => void
  setLlmCustomCommand: (cmd: string) => void
  getLlmStartupCommand: () => string
  setGlobalTerminalCwd: (path: string) => void
  setUseWorktreesForNewLlmTabs: (enabled: boolean) => void
  setCloseTabWorkflowPrompt: (prompt: string) => void
  resetCloseTabWorkflowPrompt: () => void
}

export const DEFAULT_TOKEN_CAP = 160_000
export const DEFAULT_LLM_STARTUP_COMMAND = 'claude'
export const DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT =
  'Wrap up the work in this worktree. Commit any uncommitted changes with a clear message, push the branch {branch} to origin, and open a pull request with gh pr create describing what changed and why. If there are merge conflicts, rebase on the default branch, or if gh is missing or not authenticated, stop and tell me instead of guessing.'

function upgradeLegacyProvider(persisted: unknown): Record<string, unknown> {
  const state = { ...((persisted ?? {}) as Record<string, unknown>) }
  const legacy = state.llmStartupCommand
  delete state.llmStartupCommand
  if (isLlmProviderId(state.llmProviderId)) return state
  if (typeof legacy !== 'string' || !legacy.trim()) return state
  const id = providerIdForCommand(legacy)
  state.llmProviderId = id
  if (id === 'custom') state.llmCustomCommand = legacy.trim()
  return state
}

function clampSplit(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SPLIT
  if (size < 20) return 20
  if (size > 85) return 85
  return size
}

export const DEFAULT_VAD_SILENCE_MS = 700

export function clampVadSilence(ms: unknown): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return DEFAULT_VAD_SILENCE_MS
  if (ms < 300) return 300
  if (ms > 2000) return 2000
  return Math.round(ms)
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      splitsPerProject: {},
      gitCollapsedPerProject: {},
      devTerminalsCollapsedPerProject: {},
      tokenCap: DEFAULT_TOKEN_CAP,
      idleSoundEnabled: false,
      idleSoundId: DEFAULT_IDLE_SOUND_ID,
      llmProviderId: DEFAULT_LLM_PROVIDER_ID,
      llmCustomCommand: '',
      builtinProfileColors: { ...DEFAULT_BUILTIN_PROFILE_COLORS },
      customProfiles: defaultCustomProfiles(),
      globalTerminalCwd: '',
      useWorktreesForNewLlmTabs: false,
      closeTabWorkflowPrompt: DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT,
      resetVersion: 0,
      voiceEnabled: false,
      companionEnabled: false,
      companionPromptPath: null,
      companionSpeechEnabled: false,
      companionVoiceId: DEFAULT_COMPANION_VOICE,
      companionChattiness: DEFAULT_CHATTINESS,
      voiceAgentProviderId: null,
      voiceAgentCustomCommand: '',
      voiceVadSilenceMs: DEFAULT_VAD_SILENCE_MS,
      voiceConfirmDestructive: true,

      setCompanionEnabled: (enabled: boolean) => set({ companionEnabled: enabled }),

      setCompanionPromptPath: (path: string | null) => set({ companionPromptPath: path }),

      setCompanionSpeechEnabled: (enabled: boolean) => set({ companionSpeechEnabled: enabled }),

      setCompanionVoiceId: (id: string) => set({ companionVoiceId: id }),

      setCompanionChattiness: (level: CompanionChattiness) => set({ companionChattiness: level }),

      setVoiceEnabled: (enabled: boolean) => set({ voiceEnabled: enabled }),

      setVoiceAgentProviderId: (id: LlmProviderId | null) => set({ voiceAgentProviderId: id }),

      setVoiceAgentCustomCommand: (cmd: string) => set({ voiceAgentCustomCommand: cmd.trim() }),

      setVoiceVadSilenceMs: (ms: number) => set({ voiceVadSilenceMs: clampVadSilence(ms) }),

      setVoiceConfirmDestructive: (enabled: boolean) => set({ voiceConfirmDestructive: enabled }),

      getVoiceAgentProviderId: () => {
        const { voiceAgentProviderId, llmProviderId } = get()
        const candidate = voiceAgentProviderId ?? llmProviderId
        return supportsVoiceAgent(candidate) ? candidate : DEFAULT_LLM_PROVIDER_ID
      },

      getVoiceAgentCommand: () => {
        const id = get().getVoiceAgentProviderId()
        const custom =
          id === 'custom' ? get().voiceAgentCustomCommand || get().llmCustomCommand : ''
        return resolveStartupCommand(id, custom)
      },

      getSplit: (projectId: string) => {
        return get().splitsPerProject[projectId] ?? DEFAULT_SPLIT
      },

      setSplit: (projectId: string, size: number) => {
        const safe = clampSplit(size)
        set({
          splitsPerProject: { ...get().splitsPerProject, [projectId]: safe }
        })
      },

      setGitCollapsed: (projectId: string, collapsed: boolean) => {
        const current = get().gitCollapsedPerProject
        if (!!current[projectId] === collapsed) return
        set({
          gitCollapsedPerProject: { ...current, [projectId]: collapsed }
        })
      },

      toggleGitCollapsed: (projectId: string) => {
        const current = get().gitCollapsedPerProject
        get().setGitCollapsed(projectId, !current[projectId])
      },

      setDevTerminalsCollapsed: (projectId: string, collapsed: boolean) => {
        const current = get().devTerminalsCollapsedPerProject
        if (!!current[projectId] === collapsed) return
        set({
          devTerminalsCollapsedPerProject: { ...current, [projectId]: collapsed }
        })
      },

      toggleDevTerminalsCollapsed: (projectId: string) => {
        const current = get().devTerminalsCollapsedPerProject
        get().setDevTerminalsCollapsed(projectId, !current[projectId])
      },

      setTokenCap: (cap: number) => {
        const safe = Number.isFinite(cap) && cap > 0 ? Math.round(cap) : DEFAULT_TOKEN_CAP
        set({ tokenCap: safe })
      },

      setIdleSoundEnabled: (enabled: boolean) => {
        set({ idleSoundEnabled: enabled })
      },

      setIdleSoundId: (id: string) => {
        set({ idleSoundId: id })
      },

      setLlmProviderId: (id: LlmProviderId) => {
        set({ llmProviderId: id })
      },

      setLlmCustomCommand: (cmd: string) => {
        set({ llmCustomCommand: cmd.trim() })
      },

      getLlmStartupCommand: () => {
        const { llmProviderId, llmCustomCommand, companionEnabled, companionPromptPath } = get()
        const promptPath = companionEnabled ? companionPromptPath : null
        const resolved = resolveStartupCommand(llmProviderId, llmCustomCommand, promptPath)
        return resolved.length > 0 ? resolved : DEFAULT_LLM_STARTUP_COMMAND
      },

      setBuiltinProfileColor: (id: BuiltinProfileId, color: string) => {
        if (!isValidHexColor(color)) return
        set({ builtinProfileColors: { ...get().builtinProfileColors, [id]: color } })
      },

      updateCustomProfile: (id: CustomProfileId, patch: Partial<Omit<CustomTerminalProfile, 'id'>>) => {
        const next = get().customProfiles.map((p) => {
          if (p.id !== id) return p
          return {
            ...p,
            ...(typeof patch.label === 'string' && patch.label.trim() && { label: patch.label.trim() }),
            ...(isValidHexColor(patch.color) && { color: patch.color }),
            ...(typeof patch.command === 'string' && { command: patch.command.trim() })
          }
        })
        set({ customProfiles: sanitizeCustomProfiles(next) })
      },

      resetCustomProfile: (id: CustomProfileId) => {
        const fallback = defaultCustomProfiles().find((p) => p.id === id)
        if (!fallback) return
        set({ customProfiles: get().customProfiles.map((p) => (p.id === id ? fallback : p)) })
      },

      getTerminalProfiles: () => {
        const { builtinProfileColors, customProfiles } = get()
        return buildTerminalProfiles(builtinProfileColors, customProfiles)
      },

      getTerminalProfile: (id: TerminalProfileId) => {
        const profiles = get().getTerminalProfiles()
        return profiles.find((p) => p.id === id) ?? profiles[0]
      },

      getProfileStartupCommand: (id: TerminalProfileId) => {
        const profile = get().getTerminalProfile(id)
        const { companionEnabled, companionPromptPath } = get()
        const promptPath = companionEnabled ? companionPromptPath : null
        // A custom slot keeps its own flags (`claude --resume`) and still gets
        // the companion prompt when its binary behaves like a known provider.
        return appendCompanionPrompt(profile.command, profile.providerId, promptPath)
      },

      getDefaultProfileId: () => {
        const { llmProviderId } = get()
        if (llmProviderId === 'claude' || llmProviderId === 'codex') return llmProviderId
        return null
      },

      setGlobalTerminalCwd: (path: string) => {
        set({ globalTerminalCwd: path.trim() })
      },

      setUseWorktreesForNewLlmTabs: (enabled: boolean) => {
        set({ useWorktreesForNewLlmTabs: enabled })
      },

      setCloseTabWorkflowPrompt: (prompt: string) => {
        const trimmed = prompt.trim()
        set({ closeTabWorkflowPrompt: trimmed || DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT })
      },

      resetCloseTabWorkflowPrompt: () => {
        set({ closeTabWorkflowPrompt: DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT })
      },

      resetLayout: (projectId: string) => {
        const spp = { ...get().splitsPerProject }
        delete spp[projectId]
        const gcp = { ...get().gitCollapsedPerProject }
        delete gcp[projectId]
        const dtcp = { ...get().devTerminalsCollapsedPerProject }
        delete dtcp[projectId]
        set({
          splitsPerProject: spp,
          gitCollapsedPerProject: gcp,
          devTerminalsCollapsedPerProject: dtcp,
          resetVersion: get().resetVersion + 1
        })
      }
    }),
    {
      name: 'vbcdr-layout',
      version: 1,
      migrate: (persisted: unknown) => upgradeLegacyProvider(persisted),
      partialize: (state) => ({
        splitsPerProject: state.splitsPerProject,
        gitCollapsedPerProject: state.gitCollapsedPerProject,
        devTerminalsCollapsedPerProject: state.devTerminalsCollapsedPerProject,
        tokenCap: state.tokenCap,
        idleSoundEnabled: state.idleSoundEnabled,
        idleSoundId: state.idleSoundId,
        llmProviderId: state.llmProviderId,
        llmCustomCommand: state.llmCustomCommand,
        builtinProfileColors: state.builtinProfileColors,
        customProfiles: state.customProfiles,
        globalTerminalCwd: state.globalTerminalCwd,
        useWorktreesForNewLlmTabs: state.useWorktreesForNewLlmTabs,
        closeTabWorkflowPrompt: state.closeTabWorkflowPrompt,
        voiceEnabled: state.voiceEnabled,
        companionEnabled: state.companionEnabled,
        companionSpeechEnabled: state.companionSpeechEnabled,
        companionVoiceId: state.companionVoiceId,
        companionChattiness: state.companionChattiness,
        voiceAgentProviderId: state.voiceAgentProviderId,
        voiceAgentCustomCommand: state.voiceAgentCustomCommand,
        voiceVadSilenceMs: state.voiceVadSilenceMs,
        voiceConfirmDestructive: state.voiceConfirmDestructive
      }),
      merge: (persisted, current) => {
        const incoming = upgradeLegacyProvider(persisted) as Partial<LayoutState>
        return {
          ...current,
          ...incoming,
          llmProviderId: isLlmProviderId(incoming.llmProviderId)
            ? incoming.llmProviderId
            : DEFAULT_LLM_PROVIDER_ID,
          llmCustomCommand:
            typeof incoming.llmCustomCommand === 'string' ? incoming.llmCustomCommand : '',
          builtinProfileColors: sanitizeBuiltinProfileColors(incoming.builtinProfileColors),
          customProfiles: sanitizeCustomProfiles(incoming.customProfiles),
          useWorktreesForNewLlmTabs:
            typeof incoming.useWorktreesForNewLlmTabs === 'boolean'
              ? incoming.useWorktreesForNewLlmTabs
              : false,
          closeTabWorkflowPrompt:
            typeof incoming.closeTabWorkflowPrompt === 'string' && incoming.closeTabWorkflowPrompt.trim()
              ? incoming.closeTabWorkflowPrompt
              : DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT,
          voiceEnabled: typeof incoming.voiceEnabled === 'boolean' ? incoming.voiceEnabled : false,
          companionChattiness: CHATTINESS_LEVELS.includes(
            incoming.companionChattiness as CompanionChattiness
          )
            ? (incoming.companionChattiness as CompanionChattiness)
            : DEFAULT_CHATTINESS,
          companionEnabled:
            typeof incoming.companionEnabled === 'boolean' ? incoming.companionEnabled : false,
          companionSpeechEnabled:
            typeof incoming.companionSpeechEnabled === 'boolean'
              ? incoming.companionSpeechEnabled
              : false,
          companionVoiceId:
            typeof incoming.companionVoiceId === 'string' && incoming.companionVoiceId
              ? incoming.companionVoiceId
              : DEFAULT_COMPANION_VOICE,
          voiceAgentProviderId:
            incoming.voiceAgentProviderId === null ||
            (isLlmProviderId(incoming.voiceAgentProviderId) &&
              supportsVoiceAgent(incoming.voiceAgentProviderId))
              ? (incoming.voiceAgentProviderId ?? null)
              : null,
          voiceAgentCustomCommand:
            typeof incoming.voiceAgentCustomCommand === 'string'
              ? incoming.voiceAgentCustomCommand
              : '',
          voiceVadSilenceMs: clampVadSilence(incoming.voiceVadSilenceMs),
          voiceConfirmDestructive:
            typeof incoming.voiceConfirmDestructive === 'boolean'
              ? incoming.voiceConfirmDestructive
              : true
        }
      }
    }
  )
)
