import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { earlierAgentColumns, isAgentColumn, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcPromptResolution } from '@/models/sdlc-prompts'
import { OUTPUT_VARIABLE_PREFIX, SDLC_PROMPT_VARIABLES, promptSegments } from '@/lib/llm-instructions'
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
function availableVariables(columns: SdlcColumn[], columnId: string): string[] {
  return [...SDLC_PROMPT_VARIABLES, ...earlierAgentColumns(columns, columnId).map((c) => `${OUTPUT_VARIABLE_PREFIX}${c.id}`)]
}

export function PromptVariables({ columns, columnId }: { columns: SdlcColumn[]; columnId: string }): React.ReactElement {
  const variables = availableVariables(columns, columnId)
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

const PROMPT_BOX_CLASS =
  'w-full whitespace-pre-wrap break-words rounded border px-3 py-2 font-mono text-xs leading-relaxed [scrollbar-gutter:stable]'

/**
 * Painted behind a transparent-text textarea with identical metrics, so the
 * tokens light up while the caret and selection stay native.
 */
function HighlightedPrompt({
  text,
  variables,
  dimmed,
  accent,
  scrollRef
}: {
  text: string
  variables: string[]
  dimmed: boolean
  accent: string
  scrollRef: React.RefObject<HTMLDivElement>
}): React.ReactElement {
  return (
    <div
      ref={scrollRef}
      aria-hidden
      data-testid="prompt-highlight"
      className={cn(
        PROMPT_BOX_CLASS,
        'pointer-events-none absolute inset-0 overflow-hidden border-transparent bg-zinc-900/80',
        dimmed ? 'text-zinc-600' : 'text-zinc-200'
      )}
    >
      {promptSegments(text, variables).map((segment, i) =>
        segment.variable === 'known' ? (
          <mark
            key={i}
            data-variable="known"
            className="rounded-sm"
            style={{ color: accent, backgroundColor: `${accent}${dimmed ? '14' : '26'}`, opacity: dimmed ? 0.7 : 1 }}
          >
            {segment.text}
          </mark>
        ) : segment.variable === 'unknown' ? (
          <mark
            key={i}
            data-variable="unknown"
            title="Not a variable this column can read: sent verbatim"
            className="rounded-sm bg-red-500/15 text-red-400 underline decoration-red-400/70 decoration-wavy"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
      {' '}
    </div>
  )
}

export function StagePromptField({
  column,
  columns,
  resolution,
  mode,
  onChange,
  onReset,
  accent
}: {
  column: SdlcColumn
  columns: SdlcColumn[]
  resolution: SdlcPromptResolution
  mode: SdlcPromptEditorMode
  onChange: (text: string) => void
  onReset: () => void
  accent: string
}): React.ReactElement {
  const inheriting = mode === 'project' && !resolution.overridden
  const stored = inheriting ? '' : resolution.text
  const [draft, setDraft] = useState(stored)
  const highlightRef = useRef<HTMLDivElement>(null)

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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <HighlightedPrompt
          text={draft || (inheriting ? resolution.text : '')}
          variables={availableVariables(columns, column.id)}
          dimmed={!draft}
          accent={accent}
          scrollRef={highlightRef}
        />
        <textarea
          aria-label={`Prompt for ${column.id}`}
          value={draft}
          placeholder={inheriting ? resolution.text : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onScroll={(e) => {
            if (highlightRef.current) highlightRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          spellCheck={false}
          className={cn(
            PROMPT_BOX_CLASS,
            'relative min-h-[28rem] flex-1 resize-y overflow-y-auto border-zinc-800 bg-transparent text-transparent caret-zinc-200 outline-none selection:bg-zinc-500/40 placeholder:text-transparent focus:border-zinc-600'
          )}
        />
      </div>
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
        columns={columns}
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
