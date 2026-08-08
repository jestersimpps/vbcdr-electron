import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'
import {
  DEFAULT_LLM_PROVIDER_ID,
  isLlmProviderId,
  providerIdForCommand,
  resolveStartupCommand,
  type LlmProviderId
} from '@/config/llm-provider-registry'

export const DEFAULT_SPLIT = 75

interface LayoutState {
  splitsPerProject: Record<string, number>
  gitCollapsedPerProject: Record<string, boolean>
  tokenCap: number
  idleSoundEnabled: boolean
  idleSoundId: string
  llmProviderId: LlmProviderId
  llmCustomCommand: string
  globalTerminalCwd: string
  resetVersion: number
  getSplit: (projectId: string) => number
  setSplit: (projectId: string, size: number) => void
  toggleGitCollapsed: (projectId: string) => void
  resetLayout: (projectId: string) => void
  setTokenCap: (cap: number) => void
  setIdleSoundEnabled: (enabled: boolean) => void
  setIdleSoundId: (id: string) => void
  setLlmProviderId: (id: LlmProviderId) => void
  setLlmCustomCommand: (cmd: string) => void
  getLlmStartupCommand: () => string
  setGlobalTerminalCwd: (path: string) => void
}

export const DEFAULT_TOKEN_CAP = 160_000
export const DEFAULT_LLM_STARTUP_COMMAND = 'claude'

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

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      splitsPerProject: {},
      gitCollapsedPerProject: {},
      tokenCap: DEFAULT_TOKEN_CAP,
      idleSoundEnabled: false,
      idleSoundId: DEFAULT_IDLE_SOUND_ID,
      llmProviderId: DEFAULT_LLM_PROVIDER_ID,
      llmCustomCommand: '',
      globalTerminalCwd: '',
      resetVersion: 0,

      getSplit: (projectId: string) => {
        return get().splitsPerProject[projectId] ?? DEFAULT_SPLIT
      },

      setSplit: (projectId: string, size: number) => {
        const safe = clampSplit(size)
        set({
          splitsPerProject: { ...get().splitsPerProject, [projectId]: safe }
        })
      },

      toggleGitCollapsed: (projectId: string) => {
        const current = get().gitCollapsedPerProject
        set({
          gitCollapsedPerProject: { ...current, [projectId]: !current[projectId] }
        })
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
        const { llmProviderId, llmCustomCommand } = get()
        const resolved = resolveStartupCommand(llmProviderId, llmCustomCommand)
        return resolved.length > 0 ? resolved : DEFAULT_LLM_STARTUP_COMMAND
      },

      setGlobalTerminalCwd: (path: string) => {
        set({ globalTerminalCwd: path.trim() })
      },

      resetLayout: (projectId: string) => {
        const spp = { ...get().splitsPerProject }
        delete spp[projectId]
        const gcp = { ...get().gitCollapsedPerProject }
        delete gcp[projectId]
        set({
          splitsPerProject: spp,
          gitCollapsedPerProject: gcp,
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
        tokenCap: state.tokenCap,
        idleSoundEnabled: state.idleSoundEnabled,
        idleSoundId: state.idleSoundId,
        llmProviderId: state.llmProviderId,
        llmCustomCommand: state.llmCustomCommand,
        globalTerminalCwd: state.globalTerminalCwd
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
            typeof incoming.llmCustomCommand === 'string' ? incoming.llmCustomCommand : ''
        }
      }
    }
  )
)
