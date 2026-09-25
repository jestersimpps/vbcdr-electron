import { useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, Plus, RotateCcw } from 'lucide-react'
import { DEFAULT_FLOW_ID, findFlow, isMiddleColumn, type SdlcColumn } from '@/models/sdlc-flow'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { resetFlow } from '@/lib/sdlc-flow'
import { PrefToggle, SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { SdlcColumnEditor } from '@/components/settings/SdlcColumnEditor'
import { SdlcFlowPicker } from '@/components/settings/SdlcFlowPicker'
import { cn } from '@/lib/utils'

const TAB_CLASS = 'flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors'

function FlowTab({
  column,
  index,
  draggable,
  isSelected,
  accent,
  onSelect
}: {
  column: SdlcColumn
  index: number
  draggable: boolean
  isSelected: boolean
  accent: string
  onSelect: () => void
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: !draggable
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }}
      className="flex items-center gap-1"
    >
      {index > 0 && <ChevronRight size={12} className="text-zinc-700" />}
      <button
        {...attributes}
        {...listeners}
        role="tab"
        aria-selected={isSelected}
        onClick={onSelect}
        className={cn(
          TAB_CLASS,
          draggable && 'cursor-grab active:cursor-grabbing',
          isSelected ? 'bg-zinc-900' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
        )}
        style={isSelected ? { borderColor: accent, color: accent } : undefined}
      >
        {column.label}
      </button>
    </div>
  )
}

export function SdlcFlowSection(): React.ReactElement {
  const accent = useAccent()
  const [flowId, setFlowId] = useState(DEFAULT_FLOW_ID)
  const flow = useSdlcFlowStore((s) => findFlow(s.flows, flowId) ?? s.flows[0])
  const columns = flow.columns
  const addColumn = useSdlcFlowStore((s) => s.addColumn)
  const reorderColumn = useSdlcFlowStore((s) => s.reorderColumn)
  const autoStart = useSdlcFlowStore((s) => s.autoStart)
  const setAutoStart = useSdlcFlowStore((s) => s.setAutoStart)
  const [selectedId, setSelectedId] = useState(columns[0].id)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetBlocked, setResetBlocked] = useState(false)
  const selected = columns.find((c) => c.id === selectedId) ?? columns[0]
  const last = columns[columns.length - 1]
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    reorderColumn(flow.id, String(active.id), columns.findIndex((c) => c.id === over.id))
  }

  const handleReset = (): void => {
    const done = resetFlow(flow.id)
    setResetBlocked(!done)
    setConfirmReset(false)
    if (done) setSelectedId(columns[0].id)
  }

  const selectFlow = (id: string): void => {
    setFlowId(id)
    setConfirmReset(false)
    setResetBlocked(false)
    setSelectedId(findFlow(useSdlcFlowStore.getState().flows, id)?.columns[0].id ?? columns[0].id)
  }

  return (
    <>
      <SectionCard
        title="Flows"
        description="Saved flows. Each project runs one of them, and editing a flow changes the board of every project that uses it. Save a flow as a new one to start a variant from it."
      >
        <SdlcFlowPicker flow={flow} onSelect={selectFlow} />
      </SectionCard>

      <SectionCard
        title={`${flow.name} columns`}
        description="The columns of this flow, left to right. Each column between the first and the last starts an agent with its command and prompt, and a ticket moves on by itself when the agent is done. Drag to reorder."
      >
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Flow columns">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {columns.map((column, index) => (
                <FlowTab
                  key={column.id}
                  column={column}
                  index={index}
                  draggable={isMiddleColumn(columns, index)}
                  isSelected={column.id === selected.id}
                  accent={accent}
                  onSelect={() => setSelectedId(column.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            onClick={() => setSelectedId(addColumn(flow.id, 'New column', last.id).id)}
            className={cn(TAB_CLASS, 'ml-1 border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200')}
            title={`Add a column before ${last.label}`}
            aria-label="Add column"
          >
            <Plus size={12} />
          </button>
          {confirmReset ? (
            <span className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
              Replace this flow's columns with the default Backlog, Build, Done? Tickets in other columns go back to the start.
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
              Reset to default columns
            </button>
          )}
        </div>
        {resetBlocked && (
          <p className="mt-2 text-meta text-orange-400">
            An agent is still running in a custom column. Wait for it to finish, then reset.
          </p>
        )}

        <div className="mt-3 border-t border-zinc-800 pt-3">
          <PrefToggle
            label={`Start tickets automatically from ${columns[0].label}`}
            description={
              autoStart
                ? `A new ticket goes straight to ${(columns[1] ?? last).label}, so creating it starts the flow.`
                : `A new ticket waits in ${columns[0].label} until you press Start on its card.`
            }
            enabled={autoStart}
            onToggle={() => setAutoStart(!autoStart)}
            accent={accent}
          />
        </div>
      </SectionCard>

      <SectionCard title={selected.label}>
        <SdlcColumnEditor
          key={`${flow.id}:${selected.id}`}
          flowId={flow.id}
          columns={columns}
          column={selected}
          onDeleted={() => setSelectedId(columns[0].id)}
        />
      </SectionCard>
    </>
  )
}
