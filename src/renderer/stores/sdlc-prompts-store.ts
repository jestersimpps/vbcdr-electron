import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sdlcColumns, upgradeLegacyPrompt } from '@/stores/sdlc-flow-store'
import { findColumn } from '@/models/sdlc-flow'
import type { SdlcPromptResolution } from '@/models/sdlc-prompts'

type ColumnPrompts = Record<string, string>

interface SdlcPromptsState {
  promptsPerProject: Record<string, ColumnPrompts>
  setStagePrompt: (projectId: string, stage: string, text: string) => void
  clearStagePrompt: (projectId: string, stage: string) => void
  removeProjectState: (projectId: string) => void
  removeColumnState: (columnId: string) => void
}

function withoutStage(prompts: ColumnPrompts | undefined, stage: string): ColumnPrompts {
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

      removeColumnState: (columnId: string) => {
        set((state) => ({
          promptsPerProject: Object.fromEntries(
            Object.entries(state.promptsPerProject).map(([projectId, prompts]) => [
              projectId,
              withoutStage(prompts, columnId)
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

export function resolveStagePrompt(projectId: string, stage: string): SdlcPromptResolution {
  const override = useSdlcPromptsStore.getState().promptsPerProject[projectId]?.[stage]
  if (typeof override === 'string') return { text: override, overridden: true }
  return { text: findColumn(sdlcColumns(), stage)?.prompt ?? '', overridden: false }
}
