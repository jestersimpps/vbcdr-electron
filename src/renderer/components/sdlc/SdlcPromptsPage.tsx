import { useState } from 'react'
import { ArrowLeft, FolderOpen, Workflow } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcPromptsStore } from '@/stores/sdlc-prompts-store'
import type { SdlcPromptResolution } from '@/models/sdlc-prompts'
import { SdlcPromptEditor } from '@/components/sdlc/SdlcPromptEditor'
import { SectionCard } from '@/components/settings/SettingsControls'

const EMPTY_OVERRIDES: Record<string, string> = {}

export function SdlcPromptsPage(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const showSdlcPage = useProjectStore((s) => s.showSdlcPage)
  // The board is one shared kanban, so which project's prompts are being
  // edited is a choice made here rather than whatever the app has open.
  const [picked, setPicked] = useState('')
  const project = projects.find((p) => p.id === picked) ?? projects.find((p) => p.id === activeProjectId) ?? projects[0]
  // A project's tickets can run different flows, so the columns being edited
  // are a flow's, picked here, not the project's one board.
  const flows = useSdlcFlowStore((s) => s.flows)
  const flowPerProject = useSdlcFlowStore((s) => s.flowPerProject)
  const [pickedFlow, setPickedFlow] = useState('')
  const flow =
    flows.find((f) => f.id === pickedFlow) ?? flows.find((f) => f.id === flowPerProject[project?.id ?? '']) ?? flows[0]
  const columns = flow.columns
  const overrides = useSdlcPromptsStore((s) =>
    project ? s.promptsPerProject[project.id] ?? EMPTY_OVERRIDES : EMPTY_OVERRIDES
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
            <label className="flex min-w-0 items-center gap-1.5 rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-400">
              <FolderOpen size={13} className="shrink-0 text-zinc-500" />
              <select
                value={project.id}
                onChange={(e) => setPicked(e.target.value)}
                aria-label="Project whose stage prompts are edited"
                className="cursor-pointer bg-transparent outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="truncate font-mono text-micro text-zinc-600">{project.path}</span>
            </label>
          )}
          {project && (
            <label className="flex min-w-0 items-center gap-1.5 rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-400">
              <Workflow size={13} className="shrink-0 text-zinc-500" />
              <select
                value={flow.id}
                onChange={(e) => setPickedFlow(e.target.value)}
                aria-label="Flow whose stage prompts are edited"
                className="cursor-pointer bg-transparent outline-none"
              >
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {project ? (
          <SectionCard
            title={`Overrides for ${project.name} on ${flow.name}`}
            description={`Only the stages you edit here differ from the ${flow.name} flow in Settings. Everything else follows that flow, including later edits.`}
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
            Add a project to give its stages their own prompts.
          </div>
        )}
      </div>
    </div>
  )
}
