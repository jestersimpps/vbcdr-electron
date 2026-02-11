import { useEffect, useRef, useCallback, useState } from 'react'
import ReactGridLayout from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
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
import { useLayoutStore, panelConfigs, GRID_COLS, GRID_ROWS } from '@/stores/layout-store'
import { StatusBar } from '@/components/layout/StatusBar'
import { Globe, Code, Plus, X, FolderOpen, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const MARGIN = 6
const CONTAINER_PADDING = 6

export function AppLayoutGrid(): React.ReactElement {
  const { projects, activeProjectId, loadProjects, addProject, removeProject, setActiveProject } =
    useProjectStore()
  const centerTab = useEditorStore(
    (s) => (activeProjectId ? s.centerTabPerProject[activeProjectId] ?? 'browser' : 'browser')
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const { getLayout, isLocked, saveLayout, resetLayout } = useLayoutStore()
  const resetVersion = useLayoutStore((s) => s.resetVersion)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  const projectId = activeProjectId ?? '__default__'
  const layout = getLayout(projectId)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (!containerRef.current) return
    const measure = (): void => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth)
        setHeight(containerRef.current.clientHeight)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const handleStop = (newLayout: Layout[]): void => {
    saveLayout(projectId, newLayout)
  }

  const gridLayout = layout.map((item) => ({
    ...item,
    static: isLocked(projectId, item.i as any)
  }))

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
              <div className={cn('absolute inset-0', centerTab === 'browser' ? 'z-10' : 'z-0 invisible')}>
                <BrowserViewPanel />
              </div>
              <div className={cn('absolute inset-0', centerTab === 'editor' ? 'z-10' : 'z-0 invisible')}>
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

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div
        className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-0.5 h-full flex-1"
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
        <button
          onClick={() => resetLayout(projectId)}
          className="flex items-center gap-1.5 px-3 h-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Reset layout"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
        {width > 0 && height > 0 && (
          <ReactGridLayout
            key={resetVersion}
            layout={gridLayout}
            cols={GRID_COLS}
            rowHeight={(height - 2 * CONTAINER_PADDING - (GRID_ROWS - 1) * MARGIN) / GRID_ROWS}
            width={width}
            margin={[MARGIN, MARGIN]}
            containerPadding={[CONTAINER_PADDING, CONTAINER_PADDING]}
            draggableHandle=".panel-drag-handle"
            compactType="vertical"
            resizeHandles={['se', 's', 'e']}
            onDragStop={handleStop}
            onResizeStop={handleStop}
          >
            {panelConfigs.map((panel) => (
              <div key={panel.id}>
                <DraggablePanel
                  id={panel.id}
                  projectId={projectId}
                  title={panel.title}
                  locked={isLocked(projectId, panel.id)}
                >
                  {renderPanel(panel.id)}
                </DraggablePanel>
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>

      <StatusBar />
    </div>
  )
}
