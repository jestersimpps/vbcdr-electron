import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { flowColumns, upgradeLegacyPrompt } from '@/stores/sdlc-flow-store'
import { findColumn } from '@/models/sdlc-flow'
import type { SdlcPromptResolution } from '@/models/sdlc-prompts'

type ColumnPrompts = Record<string, string>

interface SdlcPromptsState {
  promptsPerProject: Record<string, ColumnPrompts>
  setStagePrompt: (projectId: string, stage: string, text: string) => void
  clearStagePrompt: (projectId: string, stage: string) => void
  removeProjectState: (projectId: string) => void
  removeColumnState: (columnId: string, inProject: (projectId: string) => boolean) => void
}

function withoutStage(prompts: ColumnPrompts | undefined, stage: string): ColumnPrompts {
  const next = { ...prompts }
  delete next[stage]
  return next
}

/**
 * A missing key means "inherit the prompt of the project's flow". Presence is what makes a
 * stage overridden, so an override that happens to equal the default still
 * counts as one.
 */
export const useSdlcPromptsStore = create<SdlcPromptsState>()(
  persist(
    (set) => ({
      promptsPerProject: {},

      setStagePrompt: (projectId: string, stage: string, text: string) => {
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

      clearStagePrompt: (projectId: string, stage: string) => {
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
      },

      removeColumnState: (columnId: string, inProject: (projectId: string) => boolean) => {
        set((state) => ({
          promptsPerProject: Object.fromEntries(
            Object.entries(state.promptsPerProject).map(([projectId, prompts]) => [
              projectId,
              inProject(projectId) ? withoutStage(prompts, columnId) : prompts
            ])
          )
        }))
      }
    }),
    {
      name: 'vbcdr-sdlc-prompts',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as { promptsPerProject?: Record<string, ColumnPrompts> }
        const promptsPerProject = Object.fromEntries(
          Object.entries(state.promptsPerProject ?? {}).map(([projectId, prompts]) => [
            projectId,
            Object.fromEntries(Object.entries(prompts).map(([stage, text]) => [stage, upgradeLegacyPrompt(text)]))
          ])
        )
        return { ...state, promptsPerProject }
      },
      partialize: (state) => ({ promptsPerProject: state.promptsPerProject })
    }
  )
)

/**
 * An override belongs to the project and the column it names; the prompt it
 * falls back to belongs to the flow the ticket runs, so two flows that both
 * have a `build` column contribute their own default.
 */
export function resolveStagePrompt(projectId: string, flowId: string, stage: string): SdlcPromptResolution {
  const override = useSdlcPromptsStore.getState().promptsPerProject[projectId]?.[stage]
  if (typeof override === 'string') return { text: override, overridden: true }
  return { text: findColumn(flowColumns(flowId), stage)?.prompt ?? '', overridden: false }
}
