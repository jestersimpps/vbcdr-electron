import { ArrowLeft, FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useSdlcPromptsStore } from '@/stores/sdlc-prompts-store'
import {
  SDLC_HANDOFF_STAGES,
  type SdlcHandoffStage,
  type SdlcPromptResolution
} from '@/models/sdlc-prompts'
import { SdlcPromptEditor } from '@/components/sdlc/SdlcPromptEditor'
import { SectionCard } from '@/components/settings/SettingsControls'

const EMPTY_OVERRIDES = {}

export function SdlcPromptsPage(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === activeProjectId))
  const showSdlcPage = useProjectStore((s) => s.showSdlcPage)
  const globalPrompts = useLayoutStore((s) => s.sdlcStagePrompts)
  const overrides = useSdlcPromptsStore((s) =>
    activeProjectId ? s.promptsPerProject[activeProjectId] ?? EMPTY_OVERRIDES : EMPTY_OVERRIDES
  )
  const setStagePrompt = useSdlcPromptsStore((s) => s.setStagePrompt)
  const clearStagePrompt = useSdlcPromptsStore((s) => s.clearStagePrompt)

  const values = Object.fromEntries(
    SDLC_HANDOFF_STAGES.map((stage) => {
      const override = (overrides as Partial<Record<SdlcHandoffStage, string>>)[stage]
      return [
        stage,
        typeof override === 'string'
          ? { text: override, overridden: true }
          : { text: globalPrompts[stage], overridden: false }
      ]
    })
  ) as Record<SdlcHandoffStage, SdlcPromptResolution>

  return (
    <div className="min-h-full w-full p-6 text-zinc-200">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={showSdlcPage}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ArrowLeft size={13} />
            Board
          </button>
          <h1 className="text-title font-semibold">Stage prompts</h1>
          {project && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <FolderOpen size={13} />
              {project.name}
              <span className="font-mono text-micro text-zinc-600">{project.path}</span>
            </span>
          )}
        </div>

        {project ? (
          <SectionCard
            title={`Overrides for ${project.name}`}
            description="Only the stages you edit here differ from the global defaults in Settings. Everything else follows Settings, including later edits."
          >
            <SdlcPromptEditor
              mode="project"
              values={values}
              onChange={(stage, text) => setStagePrompt(project.id, stage, text)}
              onReset={(stage) => clearStagePrompt(project.id, stage)}
            />
          </SectionCard>
        ) : (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
            Select a project to edit its stage prompts.
          </div>
        )}
      </div>
    </div>
  )
}
