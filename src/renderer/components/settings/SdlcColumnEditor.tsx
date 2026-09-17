import { useState } from 'react'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import {
  columnLayout,
  defaultColumnPrompt,
  type SdlcColumn,
  type SdlcColumnKind
} from '@/models/sdlc-flow'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore, type SdlcColumnPatch } from '@/stores/sdlc-flow-store'
import { useProviderModels } from '@/hooks/useProviderModels'
import { columnHasRunningTickets, deleteColumn, ticketsInColumn } from '@/lib/sdlc-flow'
import { PromptVariables, StagePromptField } from '@/components/sdlc/SdlcPromptEditor'
import { StageModelPicker } from '@/components/sdlc/StageModelPicker'
import { PrefToggle, useAccent } from '@/components/settings/SettingsControls'
import { FLOW_INPUT_CLASS, Field, IconButton } from '@/components/settings/SdlcFlowControls'
import { SdlcPanelListEditor } from '@/components/settings/SdlcPanelListEditor'

const SUBSECTION = 'space-y-3 border-t border-zinc-800 pt-4'
const SUBSECTION_TITLE = 'text-xs font-semibold text-zinc-300'

const END_COLUMN_NOTE: Record<'first' | 'last', string> = {
  first: 'The first column is always a human one: tickets here have no worktree yet, and this is where new tickets land.',
  last: 'The last column always ends the ticket: entering it removes the worktree and its branch.'
}

function DeleteColumnConfirm({
  column,
  columns,
  onCancel,
  onDeleted
}: {
  column: SdlcColumn
  columns: SdlcColumn[]
  onCancel: () => void
  onDeleted: () => void
}): React.ReactElement {
  const ticketCount = useSdlcStore((s) => ticketsInColumn(s.tickets, column.id).length)
  const index = columns.findIndex((c) => c.id === column.id)
  const [moveTo, setMoveTo] = useState(columns[index - 1].id)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-red-900/60 bg-red-950/20 px-3 py-2 text-xs text-zinc-300">
      <span>
        Delete “{column.label}”?
        {ticketCount > 0 && ` Its ${ticketCount} ticket${ticketCount === 1 ? '' : 's'} move to`}
      </span>
      {ticketCount > 0 && (
        <select
          value={moveTo}
          onChange={(e) => setMoveTo(e.target.value)}
          aria-label="Column to move the tickets to"
          className={`${FLOW_INPUT_CLASS} w-auto`}
        >
          {columns
            .filter((c) => c.id !== column.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </select>
      )}
      <button onClick={onCancel} className="ml-auto rounded px-2.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
        Cancel
      </button>
      <button
        onClick={() => {
          if (deleteColumn(column.id, moveTo)) onDeleted()
        }}
        className="rounded bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-500"
      >
        Delete column
      </button>
    </div>
  )
}

function AgentSettings({
  column,
  columns,
  onPatch
}: {
  column: SdlcColumn
  columns: SdlcColumn[]
  onPatch: (patch: SdlcColumnPatch) => void
}): React.ReactElement {
  const accent = useAccent()
  const models = useProviderModels()
  const defaultPrompt = defaultColumnPrompt(column.id)

  return (
    <>
      <div className={SUBSECTION}>
        <h3 className={SUBSECTION_TITLE}>Prompt</h3>
        <StagePromptField
          key={column.id}
          column={column}
          resolution={{ text: column.prompt, overridden: column.prompt !== defaultPrompt }}
          mode="global"
          onChange={(prompt) => onPatch({ prompt })}
          onReset={() => onPatch({ prompt: defaultPrompt })}
          accent={accent}
        />
        <p className="text-meta text-zinc-500">
          Sent to the agent when a ticket enters the column. Projects can override it from the board. Keep the closing
          instruction about the result file: writing it is the only signal that the column is finished.{' '}
          <PromptVariables columns={columns} columnId={column.id} />
        </p>
      </div>

      <div className={SUBSECTION}>
        <h3 className={SUBSECTION_TITLE}>Agent</h3>
        <StageModelPicker stage={column.id} label="Model" models={models} className="max-w-xs" />
        <PrefToggle
          label="Run unattended"
          description="Skips the CLI's approval prompts. Off means the agent stops to ask and the ticket waits, blocked, until you answer in its tab."
          enabled={column.autonomous}
          onToggle={() => onPatch({ autonomous: !column.autonomous })}
          accent={accent}
        />
      </div>

      <div className={SUBSECTION}>
        <h3 className={SUBSECTION_TITLE}>Result</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Called" hint="Used on buttons and waiting messages: “Approve plan”.">
            <input
              value={column.outputLabel}
              onChange={(e) => onPatch({ outputLabel: e.target.value })}
              className={FLOW_INPUT_CLASS}
            />
          </Field>
          <Field label="Also save to" hint="A path in the worktree, so later agents can open the document. Optional.">
            <input
              value={column.outputFile ?? ''}
              onChange={(e) => onPatch({ outputFile: e.target.value })}
              placeholder=".vbcdr/plan.md"
              className={`${FLOW_INPUT_CLASS} font-mono`}
            />
          </Field>
        </div>
      </div>
    </>
  )
}

export function SdlcColumnEditor({ column, onDeleted }: { column: SdlcColumn; onDeleted: () => void }): React.ReactElement {
  const accent = useAccent()
  const columns = useSdlcFlowStore((s) => s.columns)
  const updateColumn = useSdlcFlowStore((s) => s.updateColumn)
  const moveColumn = useSdlcFlowStore((s) => s.moveColumn)
  const hasRunning = useSdlcStore((s) => columnHasRunningTickets(s.tickets, column.id))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const index = columns.findIndex((c) => c.id === column.id)
  const isFirst = index === 0
  const isLast = index === columns.length - 1
  const isMiddle = !isFirst && !isLast
  const layout = columnLayout(columns, column.id)
  const leftColumns = columns.slice(0, index)
  const onPatch = (patch: SdlcColumnPatch): void => updateColumn(column.id, patch)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label="Name" className="flex-1">
          <input value={column.label} onChange={(e) => onPatch({ label: e.target.value })} className={FLOW_INPUT_CLASS} />
        </Field>
        {isMiddle && (
          <Field label="Worked by" className="w-32">
            <select
              value={column.kind}
              onChange={(e) => onPatch({ kind: e.target.value as SdlcColumnKind })}
              className={FLOW_INPUT_CLASS}
            >
              <option value="agent">Agent</option>
              <option value="human">Human</option>
            </select>
          </Field>
        )}
        {isMiddle && (
          <div className="flex items-center pb-0.5">
            <IconButton label="Move column left" onClick={() => moveColumn(column.id, -1)} disabled={index <= 1}>
              <ArrowLeft size={13} />
            </IconButton>
            <IconButton
              label="Move column right"
              onClick={() => moveColumn(column.id, 1)}
              disabled={index >= columns.length - 2}
            >
              <ArrowRight size={13} />
            </IconButton>
            <IconButton
              label={hasRunning ? 'An agent is running in this column. Wait for it before deleting.' : 'Delete column'}
              onClick={() => setConfirmDelete(true)}
              disabled={hasRunning}
              danger
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>

      {confirmDelete && (
        <DeleteColumnConfirm
          column={column}
          columns={columns}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={onDeleted}
        />
      )}

      <Field label="Description">
        <input
          value={column.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="What happens to a ticket here"
          className={FLOW_INPUT_CLASS}
        />
      </Field>

      {!isMiddle && <p className="text-meta text-zinc-500">{END_COLUMN_NOTE[isFirst ? 'first' : 'last']}</p>}

      {column.kind === 'agent' && <AgentSettings column={column} columns={columns} onPatch={onPatch} />}

      {isMiddle && (
        <div className={SUBSECTION}>
          <h3 className={SUBSECTION_TITLE}>Leaving the column</h3>
          <Field label="Send back goes to" hint="Where a rejected ticket lands." className="max-w-xs">
            <select
              value={column.sendBackTo ?? ''}
              onChange={(e) => onPatch({ sendBackTo: e.target.value || null })}
              className={FLOW_INPUT_CLASS}
            >
              <option value="">The column on the left</option>
              {leftColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          {column.kind === 'agent' && (
            <>
              <PrefToggle
                label="Always wait for approval"
                description="A ticket set to run its stages automatically still stops here until you move it on."
                enabled={column.requiresApproval}
                onToggle={() => onPatch({ requiresApproval: !column.requiresApproval })}
                accent={accent}
              />
              <PrefToggle
                label="Wrap up with a pull request"
                description="The main button runs the commit, push and pull-request workflow in the agent's tab before the ticket moves on."
                enabled={column.exitAction === 'pull-request'}
                onToggle={() => onPatch({ exitAction: column.exitAction === 'pull-request' ? 'none' : 'pull-request' })}
                accent={accent}
              />
            </>
          )}
        </div>
      )}

      {layout !== 'form' && (
        <div className={SUBSECTION}>
          <h3 className={SUBSECTION_TITLE}>Ticket view</h3>
          <p className="text-meta text-zinc-500">
            {layout === 'summary'
              ? 'Shown under the change totals and the pull-request link.'
              : 'Shown on the left of the ticket, beside the comment thread and attachments.'}
          </p>
          <SdlcPanelListEditor column={column} columns={columns} onChange={(panels) => onPatch({ panels })} />
        </div>
      )}
    </div>
  )
}
