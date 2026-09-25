import { useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { DEFAULT_FLOW_ID, type SdlcFlow } from '@/models/sdlc-flow'
import { projectFlow, useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useProjectStore } from '@/stores/project-store'
import { useSdlcStore } from '@/stores/sdlc-store'
import { ticketsOnFlow } from '@/lib/sdlc-flow'
import { deleteFlow } from '@/lib/sdlc-flow'
import { FLOW_INPUT_CLASS, Field, IconButton } from '@/components/settings/SdlcFlowControls'

function SaveAsForm({
  flow,
  onSaved,
  onCancel
}: {
  flow: SdlcFlow
  onSaved: (flowId: string) => void
  onCancel: () => void
}): React.ReactElement {
  const saveFlowAs = useSdlcFlowStore((s) => s.saveFlowAs)
  const [name, setName] = useState(`${flow.name} copy`)

  const save = (): void => onSaved(saveFlowAs(flow.id, name).id)

  return (
    <div className="flex items-end gap-2">
      <Field label="New flow name" className="flex-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onCancel()
          }}
          className={FLOW_INPUT_CLASS}
        />
      </Field>
      <button onClick={onCancel} className="rounded px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
        Cancel
      </button>
      <button
        onClick={save}
        className="rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
      >
        Save flow
      </button>
    </div>
  )
}

function DeleteFlowConfirm({
  flow,
  onCancel,
  onDeleted
}: {
  flow: SdlcFlow
  onCancel: () => void
  onDeleted: () => void
}): React.ReactElement {
  const [blocked, setBlocked] = useState(false)

  const confirm = (): void => {
    const done = deleteFlow(flow.id)
    setBlocked(!done)
    if (done) onDeleted()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-red-900/60 bg-red-950/20 px-3 py-2 text-xs text-zinc-300">
      <span>
        Delete “{flow.name}”? Its tickets move onto the default flow and start over in its first column, and projects
        set to it fall back to the default for new tickets.
      </span>
      {blocked && <span className="text-orange-400">A ticket on this flow still has an agent running.</span>}
      <button onClick={onCancel} className="ml-auto rounded px-2.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
        Cancel
      </button>
      <button onClick={confirm} className="rounded bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-500">
        Delete flow
      </button>
    </div>
  )
}

export function SdlcFlowPicker({
  flow,
  onSelect
}: {
  flow: SdlcFlow
  onSelect: (flowId: string) => void
}): React.ReactElement {
  const flows = useSdlcFlowStore((s) => s.flows)
  const flowPerProject = useSdlcFlowStore((s) => s.flowPerProject)
  const renameFlow = useSdlcFlowStore((s) => s.renameFlow)
  const defaultFor = useProjectStore((s) => s.projects).filter(
    (p) => projectFlow({ flows, flowPerProject }, p.id).id === flow.id
  )
  const ticketCount = useSdlcStore((s) => ticketsOnFlow(s.tickets, flow.id).length)
  const [mode, setMode] = useState<'idle' | 'saving' | 'deleting'>('idle')
  const isDefault = flow.id === DEFAULT_FLOW_ID

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Field label="Flow" className="w-48">
          <select
            value={flow.id}
            onChange={(e) => {
              setMode('idle')
              onSelect(e.target.value)
            }}
            className={FLOW_INPUT_CLASS}
          >
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Flow name" className="flex-1">
          <input value={flow.name} onChange={(e) => renameFlow(flow.id, e.target.value)} className={FLOW_INPUT_CLASS} />
        </Field>
        <div className="flex items-center gap-1 pb-0.5">
          <IconButton label="Save as a new flow" onClick={() => setMode('saving')}>
            <Copy size={13} />
          </IconButton>
          {!isDefault && (
            <IconButton label="Delete flow" onClick={() => setMode('deleting')} danger>
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>
      </div>

      {mode === 'saving' && (
        <SaveAsForm
          flow={flow}
          onCancel={() => setMode('idle')}
          onSaved={(flowId) => {
            setMode('idle')
            onSelect(flowId)
          }}
        />
      )}
      {mode === 'deleting' && (
        <DeleteFlowConfirm
          flow={flow}
          onCancel={() => setMode('idle')}
          onDeleted={() => {
            setMode('idle')
            onSelect(DEFAULT_FLOW_ID)
          }}
        />
      )}

      <p className="text-meta text-zinc-500">
        {ticketCount > 0
          ? `${ticketCount} ticket${ticketCount === 1 ? '' : 's'} run this flow.`
          : 'No ticket runs this flow yet.'}{' '}
        {defaultFor.length > 0
          ? `New tickets in ${defaultFor.map((p) => p.name).join(', ')} start on it.`
          : ''}{' '}
        {isDefault ? 'Projects that have not picked a flow use this one. ' : ''}
        Every ticket keeps the flow it was created with, picked beside its project on the board.
      </p>
    </div>
  )
}
