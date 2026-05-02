import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react'
import ReactGridLayout from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DraggablePanel } from '@/components/layout/DraggablePanel'
import { GitTree } from '@/components/git/GitTree'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { DevTerminalsPanel } from '@/components/terminal/DevTerminalsPanel'
import { FileTree } from '@/components/sidebar/FileTree'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore, GRID_COLS, GRID_ROWS, panelConfigs } from '@/stores/layout-store'
import { StatusBar } from '@/components/layout/StatusBar'
import { ClaudeFileList } from '@/components/claude/ClaudeFileList'
import { ClaudeEditor } from '@/components/claude/ClaudeEditor'
import { ClaudePage } from '@/components/claude/ClaudePage'
import { SkillsPanel } from '@/components/skills/SkillsPanel'
import { SkillsPage } from '@/components/skills/SkillsPage'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { Statistics } from '@/components/statistics/Statistics'
import { Usage } from '@/components/usage/Usage'
import { Settings } from '@/components/settings/Settings'
import { TerminalsPage } from '@/components/terminal/TerminalsPage'
import { Code, Bot, TerminalSquare, Wand2, Plus, X, FolderOpen, LayoutDashboard, PieChart, Gauge, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/models/types'
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

function SortableProjectTab({
  project,
  isActive,
  onSelect,
  onRemove
}: {
  project: Project
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id })
  const needsAttention = useTerminalStore((s) => !isActive && !!s.attentionProjectIds[project.id])
  useEffect(() => {
    if (isActive) useTerminalStore.getState().clearProjectAttention(project.id)
  }, [isActive, project.id])
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    maxWidth: '160px',
    opacity: isDragging ? 0.5 : undefined,
    WebkitAppRegion: 'no-drag'
  } as React.CSSProperties
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      title={project.name}
      className={cn(
        'group relative flex items-center gap-1 h-full px-2 text-xs font-medium transition-colors border-b-2 min-w-0 flex-1 basis-0 cursor-pointer select-none',
        isActive
          ? 'border-zinc-400 text-zinc-200 bg-zinc-800/50'
          : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30',
        needsAttention && 'animate-pulse'
      )}
    >
      <FolderOpen size={12} className="shrink-0" />
      <span className="truncate min-w-0 flex-1 text-left">{project.name}</span>
      <ProjectTabStatus projectId={project.id} />
      <span
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100 transition-opacity"
      >
        <X size={10} />
      </span>
    </div>
  )
}

export function AppLayoutGrid(): React.ReactElement {
  const { projects, activeProjectId, dashboardActive, statisticsActive, usageActive, settingsActive, claudePageActive, skillsPageActive, terminalsPageActive, loadProjects, addProject, removeProject, setActiveProject, reorderProjects, showDashboard, showStatistics, showUsage, showSettings, showClaudePage, showSkillsPage, showTerminalsPage } =
    useProjectStore()
  const anyPageActive = dashboardActive || statisticsActive || usageActive || settingsActive || claudePageActive || skillsPageActive || terminalsPageActive
  const centerTab = useEditorStore(
    (s) => (activeProjectId ? s.centerTabPerProject[activeProjectId] ?? 'terminals' : 'terminals')
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const projectTabSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const handleProjectDragEnd = useCallback((event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = projects.findIndex((p) => p.id === active.id)
    const toIndex = projects.findIndex((p) => p.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderProjects(fromIndex, toIndex)
    }
  }, [projects, reorderProjects])
  const { getLayout, isLocked, saveLayout } = useLayoutStore()
  const resetVersion = useLayoutStore((s) => s.resetVersion)
  const backgroundImage = useLayoutStore((s) => s.backgroundImage)
  const backgroundBlur = useLayoutStore((s) => s.backgroundBlur)
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
  }, [dashboardActive, statisticsActive, usageActive, settingsActive, claudePageActive, skillsPageActive, terminalsPageActive])

  const handleStop = (newLayout: Layout[]): void => {
    saveLayout(projectId, newLayout)
  }

  const gridLayout = useMemo(
    () => layout.map((item) => ({ ...item, static: isLocked(projectId, item.i as any) })),
    [layout, projectId, isLocked]
  )

  const renderWorkspacePanel = (): React.ReactNode => (
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
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'skills')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            centerTab === 'skills'
              ? 'border-b-2 border-zinc-400 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <Wand2 size={12} />
          Skills
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
                  <ClaudeFileList projectId={activeProjectId} scope="project" />
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
              <Panel defaultSize={75} minSize={30}>
                <ClaudeEditor projectId={activeProjectId} />
              </Panel>
            </PanelGroup>
          )}
        </div>
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'skills' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && <SkillsPanel projectId={activeProjectId} scope="project" />}
        </div>
      </div>
    </div>
  )

  const renderPanel = (id: string): React.ReactNode => {
    switch (id) {
      case 'workspace':
        return renderWorkspacePanel()
      case 'git':
        return <GitTree />
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
          <div className="flex items-center h-full min-w-0 flex-1">
            <DndContext sensors={projectTabSensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
              <SortableContext items={projects.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                {projects.map((project) => (
                  <SortableProjectTab
                    key={project.id}
                    project={project}
                    isActive={activeProjectId === project.id && !anyPageActive}
                    onSelect={() => {
                      setActiveProject(project.id)
                      useTerminalStore.getState().clearProjectAttention(project.id)
                    }}
                    onRemove={() => removeProject(project.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
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

      <div className="flex flex-1 min-h-0">
        <nav className="flex w-12 flex-col items-center justify-between border-r border-zinc-800 bg-zinc-900/80 py-2">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={showDashboard}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                dashboardActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Dashboard"
            >
              <LayoutDashboard size={18} />
            </button>
            <button
              onClick={showStatistics}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                statisticsActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Statistics"
            >
              <PieChart size={18} />
            </button>
            <button
              onClick={showUsage}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                usageActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Usage"
            >
              <Gauge size={18} />
            </button>
            <button
              onClick={showClaudePage}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                claudePageActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Claude"
            >
              <Bot size={18} />
            </button>
            <button
              onClick={showSkillsPage}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                skillsPageActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Skills"
            >
              <Wand2 size={18} />
            </button>
            <button
              onClick={showTerminalsPage}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                terminalsPageActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Terminals"
            >
              <TerminalSquare size={18} />
            </button>
          </div>
          <button
            onClick={showSettings}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded transition-colors',
              settingsActive
                ? 'text-zinc-200 bg-zinc-800'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
            )}
            title="Settings"
          >
            <SettingsIcon size={18} />
          </button>
        </nav>
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
          className={cn('absolute inset-0', !backgroundImage && 'screen-gradient')}
          style={{ visibility: anyPageActive ? 'hidden' : 'visible' }}
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
        {dashboardActive && (
          <div className="absolute inset-0 z-10 overflow-auto">
            <Dashboard />
          </div>
        )}
        {statisticsActive && (
          <div className={cn('absolute inset-0 z-10 overflow-auto', !backgroundImage && 'screen-gradient')}>
            <Statistics />
          </div>
        )}
        {usageActive && (
          <div className={cn('absolute inset-0 z-10 overflow-auto', !backgroundImage && 'screen-gradient')}>
            <Usage />
          </div>
        )}
        {settingsActive && (
          <div className={cn('absolute inset-0 z-10 overflow-auto', !backgroundImage && 'screen-gradient')}>
            <Settings />
          </div>
        )}
        {claudePageActive && (
          <div className={cn('absolute inset-0 z-10 overflow-hidden', !backgroundImage && 'screen-gradient')}>
            <ClaudePage />
          </div>
        )}
        {skillsPageActive && (
          <div className={cn('absolute inset-0 z-10 overflow-hidden', !backgroundImage && 'screen-gradient')}>
            <SkillsPage />
          </div>
        )}
        {terminalsPageActive && (
          <div className={cn('absolute inset-0 z-10 overflow-hidden', !backgroundImage && 'screen-gradient')}>
            <TerminalsPage />
          </div>
        )}
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
