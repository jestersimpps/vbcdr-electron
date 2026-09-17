import { ArrowLeft, FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcPromptsStore } from '@/stores/sdlc-prompts-store'
import type { SdlcPromptResolution } from '@/models/sdlc-prompts'
import { SdlcPromptEditor } from '@/components/sdlc/SdlcPromptEditor'
import { SectionCard } from '@/components/settings/SettingsControls'

const EMPTY_OVERRIDES: Record<string, string> = {}

export function SdlcPromptsPage(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === activeProjectId))
  const showSdlcPage = useProjectStore((s) => s.showSdlcPage)
  const columns = useSdlcFlowStore((s) => s.columns)
  const overrides = useSdlcPromptsStore((s) =>
    activeProjectId ? s.promptsPerProject[activeProjectId] ?? EMPTY_OVERRIDES : EMPTY_OVERRIDES
  )
  const setStagePrompt = useSdlcPromptsStore((s) => s.setStagePrompt)
  const clearStagePrompt = useSdlcPromptsStore((s) => s.clearStagePrompt)

  const values: Record<string, SdlcPromptResolution> = Object.fromEntries(
    columns.map((column) => {
      const override = overrides[column.id]
      return [
        column.id,
        typeof override === 'string'
          ? { text: override, overridden: true }
          : { text: column.prompt, overridden: false }
      ]
    })
  )

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
              columns={columns}
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
