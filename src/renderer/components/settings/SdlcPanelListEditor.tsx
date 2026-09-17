import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  SDLC_PANEL_KINDS,
  earlierAgentColumns,
  makePanel,
  type SdlcColumn,
  type SdlcOutputFormat,
  type SdlcPanelConfig,
  type SdlcPanelKind
} from '@/models/sdlc-flow'
import { FLOW_INPUT_CLASS, IconButton } from '@/components/settings/SdlcFlowControls'

interface SdlcPanelListEditorProps {
  column: SdlcColumn
  columns: SdlcColumn[]
  onChange: (panels: SdlcPanelConfig[]) => void
}

function kindLabel(kind: SdlcPanelKind): string {
  return SDLC_PANEL_KINDS.find((d) => d.kind === kind)?.label ?? kind
}

function PanelRow({
  panel,
  column,
  sources,
  isFirst,
  isLast,
  onPatch,
  onMove,
  onRemove
}: {
  panel: SdlcPanelConfig
  column: SdlcColumn
  sources: SdlcColumn[]
  isFirst: boolean
  isLast: boolean
  onPatch: (patch: Partial<SdlcPanelConfig>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}): React.ReactElement {
  const showsOutput = panel.kind === 'output' || panel.kind === 'reference'
  const hasOwnOutput = panel.kind === 'output' && column.kind === 'agent'
  const resolvable =
    panel.sourceColumnId === null ? hasOwnOutput : sources.some((c) => c.id === panel.sourceColumnId)
  const danglingSource = showsOutput && !resolvable

  return (
    <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900/80 p-2.5">
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-micro font-medium uppercase tracking-wide text-zinc-500">
          {kindLabel(panel.kind)}
        </span>
        <input
          value={panel.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          aria-label={`Heading for the ${kindLabel(panel.kind)} panel`}
          disabled={!showsOutput}
          className={FLOW_INPUT_CLASS}
        />
        <IconButton label="Move panel up" onClick={() => onMove(-1)} disabled={isFirst}>
          <ArrowUp size={12} />
        </IconButton>
        <IconButton label="Move panel down" onClick={() => onMove(1)} disabled={isLast}>
          <ArrowDown size={12} />
        </IconButton>
        <IconButton label="Remove panel" onClick={onRemove} danger>
          <Trash2 size={12} />
        </IconButton>
      </div>

      {showsOutput && (
        <div className="flex flex-wrap items-center gap-2 pl-[6.5rem]">
          <select
            value={panel.sourceColumnId ?? ''}
            onChange={(e) => onPatch({ sourceColumnId: e.target.value || null })}
            aria-label="Whose result this panel shows"
            className={`${FLOW_INPUT_CLASS} w-auto`}
          >
            {hasOwnOutput && <option value="">{column.label} (this column)</option>}
            {danglingSource && <option value={panel.sourceColumnId ?? ''}>pick a column</option>}
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
          {panel.kind === 'output' && (
            <>
              <select
                value={panel.format}
                onChange={(e) => onPatch({ format: e.target.value as SdlcOutputFormat })}
                aria-label="How the result is rendered"
                className={`${FLOW_INPUT_CLASS} w-auto`}
              >
                <option value="markdown">Markdown</option>
                <option value="raw">Raw text</option>
              </select>
              <input
                value={panel.emptyText}
                onChange={(e) => onPatch({ emptyText: e.target.value })}
                placeholder="Shown while there is no result yet (optional)"
                aria-label="Empty state text"
                className={`${FLOW_INPUT_CLASS} min-w-[14rem] flex-1`}
              />
            </>
          )}
          {danglingSource && (
            <span className="text-meta text-orange-400">
              Its source column is gone or no longer sits before this one, so the panel stays hidden.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** What a ticket's modal shows while it sits in this column: an ordered stack of panels in the left pane. */
export function SdlcPanelListEditor({ column, columns, onChange }: SdlcPanelListEditorProps): React.ReactElement {
  const sources = earlierAgentColumns(columns, column.id)
  const { panels } = column

  const patch = (id: string, change: Partial<SdlcPanelConfig>): void =>
    onChange(panels.map((p) => (p.id === id ? { ...p, ...change } : p)))

  const move = (index: number, direction: -1 | 1): void => {
    const next = [...panels]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    onChange(next)
  }

  // Only an agent column has a result of its own; anywhere else a new panel starts on the latest earlier one.
  const add = (kind: SdlcPanelKind): void => {
    const needsSource = kind === 'reference' || (kind === 'output' && column.kind !== 'agent')
    const sourceColumnId = needsSource ? sources[sources.length - 1]?.id ?? null : null
    onChange([...panels, makePanel(kind, { sourceColumnId })])
  }

  return (
    <div className="space-y-2">
      {panels.length === 0 && (
        <div className="rounded border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
          No panels: the modal shows only the comment thread for this column.
        </div>
      )}
      {panels.map((panel, index) => (
        <PanelRow
          key={panel.id}
          panel={panel}
          column={column}
          sources={sources}
          isFirst={index === 0}
          isLast={index === panels.length - 1}
          onPatch={(change) => patch(panel.id, change)}
          onMove={(direction) => move(index, direction)}
          onRemove={() => onChange(panels.filter((p) => p.id !== panel.id))}
        />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {SDLC_PANEL_KINDS.map((definition) => (
          <button
            key={definition.kind}
            type="button"
            onClick={() => add(definition.kind)}
            disabled={sources.length === 0 && (definition.kind === 'reference' || (definition.kind === 'output' && column.kind !== 'agent'))}
            title={definition.description}
            className="flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus size={11} />
            {definition.label}
          </button>
        ))}
      </div>
    </div>
  )
}
