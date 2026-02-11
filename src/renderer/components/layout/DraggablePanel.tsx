import { GripVertical, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PanelId } from '@/stores/layout-store'
import { useLayoutStore } from '@/stores/layout-store'

interface DraggablePanelProps {
  id: PanelId
  projectId: string
  title: string
  locked: boolean
  children: React.ReactNode
}

export function DraggablePanel({
  id,
  projectId,
  title,
  locked,
  children
}: DraggablePanelProps): React.ReactElement {
  const togglePanelLock = useLayoutStore((s) => s.togglePanelLock)

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-md overflow-hidden bg-zinc-950">
      <div
        className={cn(
          'panel-drag-handle flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 border-b border-zinc-800 shrink-0',
          locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        )}
      >
        <GripVertical size={12} className={cn('text-zinc-600 shrink-0', locked && 'opacity-30')} />
        <span className="text-[11px] font-medium text-zinc-500 flex-1 truncate">{title}</span>
        <button
          onClick={() => togglePanelLock(projectId, id)}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-0.5 rounded hover:bg-zinc-800 transition-colors shrink-0"
          title={locked ? 'Unlock panel' : 'Lock panel'}
        >
          {locked ? (
            <Lock size={10} className="text-zinc-500" />
          ) : (
            <Unlock size={10} className="text-zinc-600" />
          )}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
