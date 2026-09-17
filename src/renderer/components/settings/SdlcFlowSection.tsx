import { useState } from 'react'
import { ChevronRight, Plus, RotateCcw } from 'lucide-react'
import { isAgentColumn } from '@/models/sdlc-flow'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { resetFlow } from '@/lib/sdlc-flow'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { SdlcColumnEditor } from '@/components/settings/SdlcColumnEditor'
import { cn } from '@/lib/utils'

export function SdlcFlowSection(): React.ReactElement {
  const accent = useAccent()
  const columns = useSdlcFlowStore((s) => s.columns)
  const addColumn = useSdlcFlowStore((s) => s.addColumn)
  const [selectedId, setSelectedId] = useState(columns[0].id)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetBlocked, setResetBlocked] = useState(false)
  const selected = columns.find((c) => c.id === selectedId) ?? columns[0]
  const last = columns[columns.length - 1]

  const handleReset = (): void => {
    const done = resetFlow()
    setResetBlocked(!done)
    setConfirmReset(false)
    if (done) setSelectedId(useSdlcFlowStore.getState().columns[0].id)
  }

  return (
    <>
      <SectionCard
        title="Flow"
        description="The columns every project's board uses, left to right. Pick one to edit it. The first and last are fixed in place; everything between is yours to add, reorder and remove."
      >
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Flow columns">
          {columns.map((column, index) => {
            const isSelected = column.id === selected.id
            return (
              <div key={column.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="text-zinc-700" />}
                <button
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(column.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    isSelected ? 'bg-zinc-900' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  )}
                  style={isSelected ? { borderColor: accent, color: accent } : undefined}
                >
                  {column.label}
                  {isAgentColumn(column) && (
                    <span className="h-1 w-1 shrink-0 rounded-full bg-amber-400/70" title="Agent-driven column" />
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedId(addColumn('New column', last.id).id)}
            className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <Plus size={12} />
            Add column before {last.label}
          </button>
          {confirmReset ? (
            <span className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
              Replace the flow with the default five columns? Tickets in custom columns go back to the start.
              <button onClick={() => setConfirmReset(false)} className="rounded px-2 py-1 hover:bg-zinc-800 hover:text-zinc-200">
                Cancel
              </button>
              <button onClick={handleReset} className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-500">
                Reset flow
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
            >
              <RotateCcw size={11} />
              Reset to default flow
            </button>
          )}
        </div>
        {resetBlocked && (
          <p className="mt-2 text-meta text-orange-400">
            An agent is still running in a custom column. Wait for it to finish, then reset.
          </p>
        )}
      </SectionCard>

      <SectionCard title={selected.label} description={selected.description || undefined}>
        <SdlcColumnEditor key={selected.id} column={selected} onDeleted={() => setSelectedId(columns[0].id)} />
      </SectionCard>
    </>
  )
}
