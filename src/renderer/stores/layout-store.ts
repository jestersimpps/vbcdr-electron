import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

export const DEFAULT_SPLIT = 75

interface LayoutState {
  splitsPerProject: Record<string, number>
  gitCollapsedPerProject: Record<string, boolean>
  tokenCap: number
  idleSoundEnabled: boolean
  idleSoundId: string
  llmStartupCommand: string
  globalTerminalCwd: string
  resetVersion: number
  getSplit: (projectId: string) => number
  setSplit: (projectId: string, size: number) => void
  toggleGitCollapsed: (projectId: string) => void
  resetLayout: (projectId: string) => void
  setTokenCap: (cap: number) => void
  setIdleSoundEnabled: (enabled: boolean) => void
  setIdleSoundId: (id: string) => void
  setLlmStartupCommand: (cmd: string) => void
  setGlobalTerminalCwd: (path: string) => void
}

export const DEFAULT_TOKEN_CAP = 160_000
export const DEFAULT_LLM_STARTUP_COMMAND = 'claude'

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
      llmStartupCommand: DEFAULT_LLM_STARTUP_COMMAND,
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

      setLlmStartupCommand: (cmd: string) => {
        const trimmed = cmd.trim()
        set({ llmStartupCommand: trimmed.length > 0 ? trimmed : DEFAULT_LLM_STARTUP_COMMAND })
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
      partialize: (state) => ({
        splitsPerProject: state.splitsPerProject,
        gitCollapsedPerProject: state.gitCollapsedPerProject,
        tokenCap: state.tokenCap,
        idleSoundEnabled: state.idleSoundEnabled,
        idleSoundId: state.idleSoundId,
        llmStartupCommand: state.llmStartupCommand,
        globalTerminalCwd: state.globalTerminalCwd
      })
    }
  )
)
