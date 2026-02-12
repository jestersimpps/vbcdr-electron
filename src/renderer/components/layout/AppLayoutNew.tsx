import { useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from '@dnd-kit/sortable'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DraggablePanel } from '@/components/layout/DraggablePanel'
import { BrowserViewPanel } from '@/components/browser/BrowserViewPanel'
import { DevToolsPanel } from '@/components/browser/DevToolsPanel'
import { DevTerminalsPanel } from '@/components/browser/DevTerminalsPanel'
import { GitTree } from '@/components/git/GitTree'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { FileTree } from '@/components/sidebar/FileTree'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useLayoutStore } from '@/stores/layout-store'
import { StatusBar } from '@/components/layout/StatusBar'
import { Globe, Code, Plus, X, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppLayoutNew(): React.ReactElement {
  const { projects, activeProjectId, loadProjects, addProject, removeProject, setActiveProject } =
    useProjectStore()
  const centerTab = useEditorStore(
    (s) => (activeProjectId ? s.centerTabPerProject[activeProjectId] ?? 'browser' : 'browser')
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const { panels, reorderPanels, getPanelOrder } = useLayoutStore()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = panels.findIndex((p) => p.id === active.id)
      const newIndex = panels.findIndex((p) => p.id === over.id)
      reorderPanels(oldIndex, newIndex)
    }
  }

  const renderPanel = (id: string): React.ReactNode => {
    switch (id) {
      case 'browser-editor':
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50">
              <button
                onClick={() => activeProjectId && setCenterTab(activeProjectId, 'browser')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  centerTab === 'browser'
                    ? 'border-b-2 border-zinc-400 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                <Globe size={12} />
                Browser
              </button>
              <button
                onClick={() => activeProjectId && setCenterTab(activeProjectId, 'editor')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  centerTab === 'editor'
                    ? 'border-b-2 border-zinc-400 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                <Code size={12} />
                Editor
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div
                className={cn('absolute inset-0', centerTab === 'browser' ? 'z-10' : 'z-0 invisible')}
              >
                <BrowserViewPanel />
              </div>
              <div
                className={cn('absolute inset-0', centerTab === 'editor' ? 'z-10' : 'z-0 invisible')}
              >
                {activeProjectId && (
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                      <div className="h-full overflow-hidden border-r border-zinc-800 bg-zinc-900/30">
                        <FileTree projectId={activeProjectId} />
                      </div>
                    </Panel>
                    <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
                    <Panel defaultSize={75} minSize={30}>
                      <CodeEditor projectId={activeProjectId} />
                    </Panel>
                  </PanelGroup>
                )}
              </div>
            </div>
          </div>
        )
      case 'dev-tools':
        return <DevToolsPanel />
      case 'dev-terminals':
        return <DevTerminalsPanel />
      case 'git':
        return <GitTree />
      case 'claude-terminals':
        return <TerminalPanel />
      default:
        return null
    }
  }

  const panelOrder = getPanelOrder()

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div
        className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-0.5 h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setActiveProject(project.id)}
              className={cn(
                'group flex items-center gap-1.5 h-full px-3 text-xs font-medium transition-colors border-b-2',
                activeProjectId === project.id
                  ? 'border-zinc-400 text-zinc-200 bg-zinc-800/50'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              )}
            >
              <FolderOpen size={12} className="shrink-0" />
              <span className="truncate max-w-[120px]">{project.name}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  removeProject(project.id)
                }}
                className="ml-1 rounded p-0.5 opacity-0 hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </span>
            </button>
          ))}
          <button
            onClick={addProject}
            className="flex items-center justify-center h-full px-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 gap-4 overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panelOrder} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-4 h-full" style={{ gridAutoRows: '1fr' }}>
              {panelOrder.map((panelId) => {
                const panel = panels.find((p) => p.id === panelId)
                if (!panel) return null
                return (
                  <DraggablePanel key={panel.id} id={panel.id} title={panel.title}>
                    {renderPanel(panel.id)}
                  </DraggablePanel>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <StatusBar />
    </div>
  )
}
