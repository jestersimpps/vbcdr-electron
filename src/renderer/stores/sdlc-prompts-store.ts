import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useLayoutStore } from '@/stores/layout-store'
import {
  DEFAULT_SDLC_STAGE_PROMPTS,
  type SdlcHandoffStage,
  type SdlcPromptResolution,
  type SdlcStagePrompts
} from '@/models/sdlc-prompts'

interface SdlcPromptsState {
  promptsPerProject: Record<string, Partial<SdlcStagePrompts>>
  setStagePrompt: (projectId: string, stage: SdlcHandoffStage, text: string) => void
  clearStagePrompt: (projectId: string, stage: SdlcHandoffStage) => void
  removeProjectState: (projectId: string) => void
}

function withoutStage(
  prompts: Partial<SdlcStagePrompts> | undefined,
  stage: SdlcHandoffStage
): Partial<SdlcStagePrompts> {
  const next = { ...prompts }
  delete next[stage]
  return next
}

/**
 * A missing key means "inherit the global prompt". Presence is what makes a
 * stage overridden, so an override that happens to equal the default still
 * counts as one.
 */
export const useSdlcPromptsStore = create<SdlcPromptsState>()(
  persist(
    (set) => ({
      promptsPerProject: {},

      setStagePrompt: (projectId: string, stage: SdlcHandoffStage, text: string) => {
        const trimmed = text.trim()
        set((state) => ({
          promptsPerProject: {
            ...state.promptsPerProject,
            [projectId]: trimmed
              ? { ...state.promptsPerProject[projectId], [stage]: text }
              : withoutStage(state.promptsPerProject[projectId], stage)
          }
        }))
      },

      clearStagePrompt: (projectId: string, stage: SdlcHandoffStage) => {
        set((state) => ({
          promptsPerProject: {
            ...state.promptsPerProject,
            [projectId]: withoutStage(state.promptsPerProject[projectId], stage)
          }
        }))
      },

      removeProjectState: (projectId: string) => {
        set((state) => {
          const next = { ...state.promptsPerProject }
          delete next[projectId]
          return { promptsPerProject: next }
        })
      }
    }),
    {
      name: 'vbcdr-sdlc-prompts',
      partialize: (state) => ({ promptsPerProject: state.promptsPerProject })
    }
  )
)

export function resolveStagePrompt(projectId: string, stage: SdlcHandoffStage): SdlcPromptResolution {
  const override = useSdlcPromptsStore.getState().promptsPerProject[projectId]?.[stage]
  if (typeof override === 'string') return { text: override, overridden: true }
  const global = useLayoutStore.getState().sdlcStagePrompts[stage]
  return { text: global || DEFAULT_SDLC_STAGE_PROMPTS[stage], overridden: false }
}
