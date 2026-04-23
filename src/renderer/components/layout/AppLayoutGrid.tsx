import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react'
import ReactGridLayout from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { ImperativePanelHandle } from 'react-resizable-panels'
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
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore, GRID_COLS, GRID_ROWS, getPanelConfigs } from '@/stores/layout-store'
import { StatusBar } from '@/components/layout/StatusBar'
import { ClaudeFileList } from '@/components/claude/ClaudeFileList'
import { ClaudeEditor } from '@/components/claude/ClaudeEditor'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { Globe, Code, Bot, TerminalSquare, Plus, X, FolderOpen, ChevronLeft, ChevronRight, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const MARGIN = 6
const CONTAINER_PADDING = 6

const ProjectTabStatus = memo(function ProjectTabStatus({ projectId }: { projectId: string }): React.ReactElement | null {
  const tabs = useTerminalStore((s) => s.tabs)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const llmTabs = tabs.filter((t) => t.projectId === projectId && t.initialCommand)
  if (llmTabs.length === 0) return null
  const anyBusy = llmTabs.some((t) => tabStatuses[t.id] === 'busy')
  if (anyBusy) return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 shrink-0" />
  const allIdle = llmTabs.every((t) => tabStatuses[t.id] === 'idle')
  if (allIdle) return <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
  return null
})

export function AppLayoutGrid(): React.ReactElement {
  const { projects, activeProjectId, dashboardActive, loadProjects, addProject, removeProject, setActiveProject, showDashboard } =
    useProjectStore()
  const browserless = useLayoutStore((s) => activeProjectId ? s.isBrowserless(activeProjectId) : false)
  const defaultTab = browserless ? 'terminals' : 'browser'
  const centerTab = useEditorStore(
    (s) => {
      if (!activeProjectId) return defaultTab
      const tab = s.centerTabPerProject[activeProjectId] ?? defaultTab
      if (browserless && tab === 'browser') return 'terminals'
      if (!browserless && tab === 'terminals') return 'browser'
      return tab
    }
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const { getLayout, isLocked, saveLayout, isDevToolsCollapsed, setDevToolsCollapsed } = useLayoutStore()
  const resetVersion = useLayoutStore((s) => s.resetVersion)
  const backgroundImage = useLayoutStore((s) => s.backgroundImage)
  const backgroundBlur = useLayoutStore((s) => s.backgroundBlur)
  const containerRef = useRef<HTMLDivElement>(null)
  const devToolsPanelRef = useRef<ImperativePanelHandle>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  const projectId = activeProjectId ?? '__default__'
  const layout = getLayout(projectId, browserless)
  const collapsed = isDevToolsCollapsed(projectId)
  const activePanelConfigs = getPanelConfigs(browserless)

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
  }, [dashboardActive])

  useEffect(() => {
    if (browserless) return
    const panel = devToolsPanelRef.current
    if (!panel) return
    if (collapsed) {
      panel.collapse()
    } else {
      panel.expand()
    }
  }, [collapsed, resetVersion, browserless])

  const handleStop = (newLayout: Layout[]): void => {
    saveLayout(projectId, newLayout)
  }

  const toggleDevTools = useCallback(() => {
    const panel = devToolsPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
    } else {
      panel.collapse()
    }
  }, [])

  const handleDevToolsCollapse = useCallback(() => {
    setDevToolsCollapsed(projectId, true)
  }, [projectId, setDevToolsCollapsed])

  const handleDevToolsExpand = useCallback(() => {
    setDevToolsCollapsed(projectId, false)
  }, [projectId, setDevToolsCollapsed])

  const gridLayout = useMemo(
    () => layout.map((item) => ({ ...item, static: isLocked(projectId, item.i as any) })),
    [layout, projectId, isLocked]
  )

  const renderBrowserlessPanel = (): React.ReactNode => (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'terminals')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            centerTab === 'terminals'
              ? 'border-b-2 border-zinc-400 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <TerminalSquare size={12} />
          Terminals
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
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'claude')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            centerTab === 'claude'
              ? 'border-b-2 border-zinc-400 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <Bot size={12} />
          Claude
        </button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className={cn('absolute inset-0', centerTab === 'terminals' ? 'z-10' : 'z-0 invisible')}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={35} minSize={15}>
              <DevTerminalsPanel />
            </Panel>
            <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
            <Panel defaultSize={65} minSize={20}>
              <TerminalPanel />
            </Panel>
          </PanelGroup>
        </div>
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'editor' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <div className="h-full overflow-hidden border-r border-zinc-800 bg-zinc-900">
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
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'claude' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <div className="h-full overflow-hidden border-r border-zinc-800 bg-zinc-900">
                  <ClaudeFileList projectId={activeProjectId} />
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
              <Panel defaultSize={75} minSize={30}>
                <ClaudeEditor projectId={activeProjectId} />
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>
    </div>
  )

  const renderBrowserPanel = (): React.ReactNode => (
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
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'claude')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            centerTab === 'claude'
              ? 'border-b-2 border-zinc-400 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <Bot size={12} />
          Claude
        </button>
        <button
          onClick={toggleDevTools}
          className="ml-auto flex items-center gap-1 px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          title={collapsed ? 'Show DevTools' : 'Hide DevTools'}
        >
          {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          <span className="text-[10px]">DevTools</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={65} minSize={20}>
            <div className="relative h-full overflow-hidden">
              <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'browser' ? 'z-10' : 'z-0 invisible')}>
                <BrowserViewPanel />
              </div>
              <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'editor' ? 'z-10' : 'z-0 invisible')}>
                {activeProjectId && (
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                      <div className="h-full overflow-hidden border-r border-zinc-800 bg-zinc-900">
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
              <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'claude' ? 'z-10' : 'z-0 invisible')}>
                {activeProjectId && (
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                      <div className="h-full overflow-hidden border-r border-zinc-800 bg-zinc-900">
                        <ClaudeFileList projectId={activeProjectId} />
                      </div>
                    </Panel>
                    <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
                    <Panel defaultSize={75} minSize={30}>
                      <ClaudeEditor projectId={activeProjectId} />
                    </Panel>
                  </PanelGroup>
                )}
              </div>
            </div>
          </Panel>
          {!collapsed && (
            <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
          )}
          <Panel
            ref={devToolsPanelRef}
            defaultSize={35}
            minSize={15}
            collapsible
            collapsedSize={0}
            onCollapse={handleDevToolsCollapse}
            onExpand={handleDevToolsExpand}
          >
            <DevToolsPanel />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )

  const renderPanel = (id: string): React.ReactNode => {
    switch (id) {
      case 'browser-editor':
        return browserless ? renderBrowserlessPanel() : renderBrowserPanel()
      case 'git':
        return <GitTree />
      case 'llm-terminals':
        return <TerminalPanel />
      default:
        return null
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div
        className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-0.5 h-full flex-1 min-w-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={showDashboard}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={cn(
              'flex items-center justify-center h-full px-3 transition-colors',
              dashboardActive
                ? 'text-zinc-200 bg-zinc-800/50'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
            )}
            title="Dashboard"
          >
            <LayoutDashboard size={14} />
          </button>
          <div className="mx-1 h-4 w-px bg-zinc-700/60" />
          <div className="flex items-center h-full min-w-0 flex-1">
            {[...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((project) => (
              <button
                key={project.id}
                onClick={() => setActiveProject(project.id)}
                title={project.name}
                className={cn(
                  'group relative flex items-center gap-1 h-full px-2 text-xs font-medium transition-colors border-b-2 min-w-0 flex-1 basis-0',
                  activeProjectId === project.id && !dashboardActive
                    ? 'border-zinc-400 text-zinc-200 bg-zinc-800/50'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                )}
                style={{ maxWidth: '160px' }}
              >
                <FolderOpen size={12} className="shrink-0" />
                <span className="truncate min-w-0 flex-1 text-left">{project.name}</span>
                <ProjectTabStatus projectId={project.id} />
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    removeProject(project.id)
                  }}
                  className="shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={addProject}
            className="flex items-center justify-center h-full px-2 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            title="Add project"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        {backgroundImage && (
          <div
            className="absolute inset-0 pointer-events-none bg-cover bg-center"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
              transform: backgroundBlur > 0 ? 'scale(1.05)' : undefined
            }}
          />
        )}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dashboardActive ? 'hidden' : 'visible' }}
        >
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
              {activePanelConfigs.map((panel) => (
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
        {dashboardActive && (
          <div className="absolute inset-0 z-10 overflow-auto">
            <Dashboard />
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  )
}
