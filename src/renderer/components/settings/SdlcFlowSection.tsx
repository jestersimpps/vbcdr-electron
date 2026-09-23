import { useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, Plus, RotateCcw } from 'lucide-react'
import { isMiddleColumn, type SdlcColumn } from '@/models/sdlc-flow'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { resetFlow } from '@/lib/sdlc-flow'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { SdlcColumnEditor } from '@/components/settings/SdlcColumnEditor'
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
  const columns = useSdlcFlowStore((s) => s.columns)
  const addColumn = useSdlcFlowStore((s) => s.addColumn)
  const reorderColumn = useSdlcFlowStore((s) => s.reorderColumn)
  const [selectedId, setSelectedId] = useState(columns[0].id)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetBlocked, setResetBlocked] = useState(false)
  const selected = columns.find((c) => c.id === selectedId) ?? columns[0]
  const last = columns[columns.length - 1]
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    reorderColumn(String(active.id), columns.findIndex((c) => c.id === over.id))
  }

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
        description="The columns every project's board uses, left to right. Each column between the first and the last starts an agent with its command and prompt, and a ticket moves on by itself when the agent is done. Drag to reorder."
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
            onClick={() => setSelectedId(addColumn('New column', last.id).id)}
            className={cn(TAB_CLASS, 'ml-1 border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200')}
            title={`Add a column before ${last.label}`}
            aria-label="Add column"
          >
            <Plus size={12} />
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

      <SectionCard title={selected.label}>
        <SdlcColumnEditor key={selected.id} column={selected} onDeleted={() => setSelectedId(columns[0].id)} />
      </SectionCard>
    </>
  )
}
