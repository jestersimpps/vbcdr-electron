import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { SDLC_STAGES } from '@/models/sdlc'
import {
  SDLC_HANDOFF_STAGES,
  type SdlcHandoffStage,
  type SdlcPromptResolution
} from '@/models/sdlc-prompts'
import { useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

export type SdlcPromptEditorMode = 'global' | 'project'

export interface SdlcPromptEditorProps {
  values: Record<SdlcHandoffStage, SdlcPromptResolution>
  onChange: (stage: SdlcHandoffStage, text: string) => void
  onReset: (stage: SdlcHandoffStage) => void
  mode: SdlcPromptEditorMode
}

const VARIABLES = ['title', 'description', 'branch', 'worktreePath', 'projectPath', 'plan', 'diff']

function StagePromptField({
  stage,
  resolution,
  mode,
  onChange,
  onReset,
  accent
}: {
  stage: SdlcHandoffStage
  resolution: SdlcPromptResolution
  mode: SdlcPromptEditorMode
  onChange: (text: string) => void
  onReset: () => void
  accent: string
}): React.ReactElement {
  const definition = SDLC_STAGES.find((s) => s.id === stage)
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
          {definition && <span className="truncate text-meta text-zinc-500">{definition.description}</span>}
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
        aria-label={`Prompt for ${stage}`}
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

/** One tab per stage: a prompt is a document, and four stacked textareas left each one a slit. */
export function SdlcPromptEditor({ values, onChange, onReset, mode }: SdlcPromptEditorProps): React.ReactElement {
  const accent = useAccent()
  const [active, setActive] = useState<SdlcHandoffStage>(SDLC_HANDOFF_STAGES[0])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-zinc-800" role="tablist" aria-label="Stage prompts">
        {SDLC_HANDOFF_STAGES.map((stage) => {
          const isActive = stage === active
          const label = SDLC_STAGES.find((s) => s.id === stage)?.label ?? stage
          return (
            <button
              key={stage}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(stage)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                isActive ? 'text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
              style={isActive ? { borderColor: accent, color: accent } : undefined}
            >
              {label}
              {mode === 'project' && values[stage].overridden && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} aria-label="overridden" />
              )}
            </button>
          )
        })}
      </div>

      <StagePromptField
        key={active}
        stage={active}
        resolution={values[active]}
        mode={mode}
        onChange={(text) => onChange(active, text)}
        onReset={() => onReset(active)}
        accent={accent}
      />

      <p className="text-meta text-zinc-500">
        {mode === 'project'
          ? 'An empty field inherits the global prompt shown in grey. Type to override this project; clear the field to inherit again.'
          : 'Sent to the agent when a ticket enters the stage. Projects can override any of these.'}{' '}
        Variables:{' '}
        {VARIABLES.map((v, i) => (
          <span key={v}>
            <code className="rounded bg-zinc-800 px-1 text-zinc-300">{`{{${v}}}`}</code>
            {i < VARIABLES.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
    </div>
  )
}
