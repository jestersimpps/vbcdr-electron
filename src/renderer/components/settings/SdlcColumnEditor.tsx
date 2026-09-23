import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  DEFAULT_AGENT_COMMAND,
  defaultColumnPrompt,
  hasCommand,
  isMiddleColumn,
  type SdlcColumn
} from '@/models/sdlc-flow'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore, type SdlcColumnPatch } from '@/stores/sdlc-flow-store'
import { columnHasRunningTickets, deleteColumn, ticketsInColumn, ticketsOnFlow } from '@/lib/sdlc-flow'
import { PromptVariables, StagePromptField } from '@/components/sdlc/SdlcPromptEditor'
import { useAccent } from '@/components/settings/SettingsControls'
import { FLOW_INPUT_CLASS, Field, IconButton } from '@/components/settings/SdlcFlowControls'

const END_COLUMN_NOTE: Record<'first' | 'last', string> = {
  first: 'New tickets land here and start the flow straight away. The first column never runs an agent.',
  last: 'The last column ends the ticket: entering it commits leftover work, removes the worktree and keeps the branch. Its prompt runs on demand, from the button on a ticket or the column, or on the project timer, in a worktree reopened on that branch.'
}

function DeleteColumnConfirm({
  flowId,
  column,
  columns,
  onCancel,
  onDeleted
}: {
  flowId: string
  column: SdlcColumn
  columns: SdlcColumn[]
  onCancel: () => void
  onDeleted: () => void
}): React.ReactElement {
  const ticketCount = useSdlcStore((s) => ticketsInColumn(ticketsOnFlow(s.tickets, flowId), column.id).length)
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
          if (deleteColumn(flowId, column.id, moveTo)) onDeleted()
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
  const defaultPrompt = defaultColumnPrompt(columns, column.id)

  return (
    <>
      <Field label="Startup command" hint="Runs in the ticket's worktree. Shown on top of the column on the board.">
        <input
          value={column.command}
          aria-label="Startup command"
          onChange={(e) => onPatch({ command: e.target.value })}
          placeholder={DEFAULT_AGENT_COMMAND}
          spellCheck={false}
          className={`${FLOW_INPUT_CLASS} font-mono`}
        />
      </Field>

      <div className="space-y-3 border-t border-zinc-800 pt-4">
        <h3 className="text-xs font-semibold text-zinc-300">Prompt</h3>
        <StagePromptField
          key={column.id}
          column={column}
          columns={columns}
          resolution={{ text: column.prompt, overridden: column.prompt !== defaultPrompt }}
          mode="global"
          onChange={(prompt) => onPatch({ prompt })}
          onReset={() => onPatch({ prompt: defaultPrompt })}
          accent={accent}
        />
        <p className="text-meta text-zinc-500">
          {column.kind === 'terminal'
            ? 'Sent when you run it for a finished ticket. Nothing waits for it, so it needs no result file.'
            : 'Sent to the agent when a ticket enters the column. Projects can override it from the board. Keep the closing instruction about the result file: writing it is what moves the ticket on.'}{' '}
          <PromptVariables columns={columns} columnId={column.id} />
        </p>
      </div>
    </>
  )
}

export function SdlcColumnEditor({
  flowId,
  columns,
  column,
  onDeleted
}: {
  flowId: string
  columns: SdlcColumn[]
  column: SdlcColumn
  onDeleted: () => void
}): React.ReactElement {
  const updateColumn = useSdlcFlowStore((s) => s.updateColumn)
  const hasRunning = useSdlcStore((s) => columnHasRunningTickets(ticketsOnFlow(s.tickets, flowId), column.id))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const index = columns.findIndex((c) => c.id === column.id)
  const isMiddle = isMiddleColumn(columns, index)
  const onPatch = (patch: SdlcColumnPatch): void => updateColumn(flowId, column.id, patch)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label="Name" className="flex-1">
          <input value={column.label} onChange={(e) => onPatch({ label: e.target.value })} className={FLOW_INPUT_CLASS} />
        </Field>
        {isMiddle && (
          <div className="flex items-center pb-0.5">
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
          flowId={flowId}
          column={column}
          columns={columns}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={onDeleted}
        />
      )}

      {!isMiddle && <p className="text-meta text-zinc-500">{END_COLUMN_NOTE[index === 0 ? 'first' : 'last']}</p>}

      {hasCommand(column) && <AgentSettings column={column} columns={columns} onPatch={onPatch} />}
    </div>
  )
}
