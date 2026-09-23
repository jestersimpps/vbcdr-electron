import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { earlierAgentColumns, isAgentColumn, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcPromptResolution } from '@/models/sdlc-prompts'
import { OUTPUT_VARIABLE_PREFIX, SDLC_PROMPT_VARIABLES } from '@/lib/llm-instructions'
import { useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

export type SdlcPromptEditorMode = 'global' | 'project'

export interface SdlcPromptEditorProps {
  /** Every column of the flow, in order: the agent ones get a tab, the rest only decide which outputs are readable. */
  columns: SdlcColumn[]
  values: Record<string, SdlcPromptResolution>
  onChange: (stage: string, text: string) => void
  onReset: (stage: string) => void
}

/** A prompt can read the results of the agent columns before it, which is why the list depends on the column. */
export function PromptVariables({ columns, columnId }: { columns: SdlcColumn[]; columnId: string }): React.ReactElement {
  const variables = [
    ...SDLC_PROMPT_VARIABLES,
    ...earlierAgentColumns(columns, columnId).map((c) => `${OUTPUT_VARIABLE_PREFIX}${c.id}`)
  ]
  return (
    <>
      Variables:{' '}
      {variables.map((v) => (
        <span key={v}>
          <code className="rounded bg-zinc-800 px-1 text-zinc-300">{`{{${v}}}`}</code>{' '}
        </span>
      ))}
    </>
  )
}

export function StagePromptField({
  column,
  resolution,
  mode,
  onChange,
  onReset,
  accent
}: {
  column: SdlcColumn
  resolution: SdlcPromptResolution
  mode: SdlcPromptEditorMode
  onChange: (text: string) => void
  onReset: () => void
  accent: string
}): React.ReactElement {
  const inheriting = mode === 'project' && !resolution.overridden
  const stored = inheriting ? '' : resolution.text
  const [draft, setDraft] = useState(stored)

  useEffect(() => {
    setDraft(stored)
  }, [stored])

  const commit = (): void => {
    if (draft.trim() === '') {
      if (resolution.overridden) onReset()
      else setDraft(stored)
      return
    }
    if (draft !== stored) onChange(draft)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {mode === 'project' && (
            <span
              className="shrink-0 rounded px-1.5 py-px text-micro font-medium"
              style={
                resolution.overridden
                  ? { color: accent, backgroundColor: `${accent}1f` }
                  : { color: 'rgb(113 113 122)', backgroundColor: 'rgb(39 39 42 / 0.6)' }
              }
            >
              {resolution.overridden ? 'overridden' : 'inherited'}
            </span>
          )}
        </div>
        <button
          onClick={onReset}
          disabled={!resolution.overridden}
          className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200 disabled:opacity-40"
          title={mode === 'project' ? 'Use the global prompt' : 'Reset to default'}
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>
      <textarea
        aria-label={`Prompt for ${column.id}`}
        value={draft}
        placeholder={inheriting ? resolution.text : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        className="min-h-[28rem] w-full flex-1 resize-y rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
      />
    </div>
  )
}

/** One tab per agent column: a prompt is a document, and stacked textareas left each one a slit. */
export function SdlcPromptEditor({ columns, values, onChange, onReset }: SdlcPromptEditorProps): React.ReactElement {
  const accent = useAccent()
  const agentColumns = columns.filter(isAgentColumn)
  const [activeId, setActiveId] = useState<string | undefined>(agentColumns[0]?.id)
  const active = agentColumns.find((c) => c.id === activeId) ?? agentColumns[0]

  if (!active) {
    return <p className="text-meta text-zinc-500">This flow has no agent columns, so there are no prompts to override.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-zinc-800" role="tablist" aria-label="Stage prompts">
        {agentColumns.map((column) => {
          const isActive = column.id === active.id
          return (
            <button
              key={column.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(column.id)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                isActive ? 'text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
              style={isActive ? { borderColor: accent, color: accent } : undefined}
            >
              {column.label}
              {values[column.id]?.overridden && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} aria-label="overridden" />
              )}
            </button>
          )
        })}
      </div>

      <StagePromptField
        key={active.id}
        column={active}
        resolution={values[active.id]}
        mode="project"
        onChange={(text) => onChange(active.id, text)}
        onReset={() => onReset(active.id)}
        accent={accent}
      />

      <p className="text-meta text-zinc-500">
        An empty field inherits the global prompt shown in grey. Type to override this project; clear the field to
        inherit again. <PromptVariables columns={columns} columnId={active.id} />
      </p>
    </div>
  )
}
