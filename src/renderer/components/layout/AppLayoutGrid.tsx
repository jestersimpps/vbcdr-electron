import { useEffect, useCallback, memo } from 'react'
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
import { GitTree } from '@/components/git/GitTree'
import { DiffPanel } from '@/components/git/DiffPanel'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { DevTerminalsPanel } from '@/components/terminal/DevTerminalsPanel'
import { FileTree } from '@/components/sidebar/FileTree'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { StatusBar } from '@/components/layout/StatusBar'
import { PanelErrorBoundary } from '@/components/layout/PanelErrorBoundary'
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
import { DevServersPage } from '@/components/dev-servers/DevServersPage'
import { Code, Bot, TerminalSquare, Wand2, Plus, X, FolderOpen, LayoutDashboard, PieChart, Gauge, GitCompareArrows, Server, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/models/types'

const TITLEBAR_DRAG_STYLE: React.CSSProperties = { WebkitAppRegion: 'drag' } as React.CSSProperties
const TITLEBAR_NO_DRAG_STYLE: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

const ProjectTabStatus = memo(function ProjectTabStatus({ projectId }: { projectId: string }): React.ReactElement | null {
  const status = useTerminalStore((s) => {
    let hasLlm = false
    let anyBusy = false
    let allIdle = true
    for (const t of s.tabs) {
      if (t.projectId !== projectId || !t.initialCommand) continue
      hasLlm = true
      const st = s.tabStatuses[t.id]
      if (st === 'busy') anyBusy = true
      if (st !== 'idle') allIdle = false
    }
    if (!hasLlm) return null
    if (anyBusy) return 'busy'
    if (allIdle) return 'idle'
    return null
  })
  if (status === 'busy') return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 shrink-0" />
  if (status === 'idle') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
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
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    maxWidth: '160px',
    opacity: isDragging ? 0.5 : undefined,
    ...TITLEBAR_NO_DRAG_STYLE
  }
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
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const dashboardActive = useProjectStore((s) => s.dashboardActive)
  const statisticsActive = useProjectStore((s) => s.statisticsActive)
  const usageActive = useProjectStore((s) => s.usageActive)
  const settingsActive = useProjectStore((s) => s.settingsActive)
  const claudePageActive = useProjectStore((s) => s.claudePageActive)
  const skillsPageActive = useProjectStore((s) => s.skillsPageActive)
  const terminalsPageActive = useProjectStore((s) => s.terminalsPageActive)
  const devServersPageActive = useProjectStore((s) => s.devServersPageActive)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const addProject = useProjectStore((s) => s.addProject)
  const removeProject = useProjectStore((s) => s.removeProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const reorderProjects = useProjectStore((s) => s.reorderProjects)
  const showDashboard = useProjectStore((s) => s.showDashboard)
  const showStatistics = useProjectStore((s) => s.showStatistics)
  const showUsage = useProjectStore((s) => s.showUsage)
  const showSettings = useProjectStore((s) => s.showSettings)
  const showClaudePage = useProjectStore((s) => s.showClaudePage)
  const showSkillsPage = useProjectStore((s) => s.showSkillsPage)
  const showTerminalsPage = useProjectStore((s) => s.showTerminalsPage)
  const showDevServersPage = useProjectStore((s) => s.showDevServersPage)
  const anyPageActive = dashboardActive || statisticsActive || usageActive || settingsActive || claudePageActive || skillsPageActive || terminalsPageActive || devServersPageActive
  const centerTab = useEditorStore(
    (s) => (activeProjectId ? s.centerTabPerProject[activeProjectId] ?? 'terminals' : 'terminals')
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const projectTabSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const handleProjectDragEnd = useCallback((event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const currentProjects = useProjectStore.getState().projects
    const fromIndex = currentProjects.findIndex((p) => p.id === active.id)
    const toIndex = currentProjects.findIndex((p) => p.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderProjects(fromIndex, toIndex)
    }
  }, [reorderProjects])
  const getSplit = useLayoutStore((s) => s.getSplit)
  const setSplit = useLayoutStore((s) => s.setSplit)
  const resetVersion = useLayoutStore((s) => s.resetVersion)

  const projectId = activeProjectId ?? '__default__'
  const splitSize = getSplit(projectId)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const activeProjectPath = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)?.path ?? null
    : null

  const renderWorkspacePanel = (): React.ReactNode => (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'terminals')}
          className={cn(
            'flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors',
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
            'flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors',
            centerTab === 'editor'
              ? 'border-b-2 border-zinc-400 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <Code size={12} />
          Editor
        </button>
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'diff')}
          className={cn(
            'flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors',
            centerTab === 'diff'
              ? 'border-b-2 border-zinc-400 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <GitCompareArrows size={12} />
          Diff
        </button>
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'claude')}
          className={cn(
            'flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors',
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
            'flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors',
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
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'terminals' ? 'z-10' : 'z-0 invisible')}>
          <PanelErrorBoundary label="Terminals">
            <PanelGroup direction="horizontal">
              <Panel defaultSize={35} minSize={15}>
                <DevTerminalsPanel />
              </Panel>
              <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
              <Panel defaultSize={65} minSize={20}>
                <TerminalPanel />
              </Panel>
            </PanelGroup>
          </PanelErrorBoundary>
        </div>
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'editor' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && (
            <PanelErrorBoundary label="Editor">
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
            </PanelErrorBoundary>
          )}
        </div>
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'diff' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && activeProjectPath && (
            <PanelErrorBoundary label="Diff">
              <DiffPanel projectId={activeProjectId} cwd={activeProjectPath} />
            </PanelErrorBoundary>
          )}
        </div>
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'claude' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && (
            <PanelErrorBoundary label="Claude">
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
            </PanelErrorBoundary>
          )}
        </div>
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'skills' ? 'z-10' : 'z-0 invisible')}>
          {activeProjectId && (
            <PanelErrorBoundary label="Skills">
              <SkillsPanel projectId={activeProjectId} scope="project" />
            </PanelErrorBoundary>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div
        className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20"
        style={TITLEBAR_DRAG_STYLE}
      >
        <div
          className="flex items-center gap-0.5 h-full flex-1 min-w-0"
          style={TITLEBAR_NO_DRAG_STYLE}
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
            <button
              onClick={showDevServersPage}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                devServersPageActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Dev Servers"
            >
              <Server size={18} />
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
        <div
          className="absolute inset-0"
          style={{ visibility: anyPageActive ? 'hidden' : 'visible' }}
        >
          <PanelGroup
            key={`${projectId}-${resetVersion}`}
            direction="horizontal"
            onLayout={(sizes) => {
              if (sizes[0] !== undefined) setSplit(projectId, sizes[0])
            }}
          >
            <Panel defaultSize={splitSize} minSize={20}>
              <div className="h-full overflow-hidden">
                {renderWorkspacePanel()}
              </div>
            </Panel>
            <PanelResizeHandle className="w-px bg-zinc-800 hover:bg-zinc-600 transition-colors" />
            <Panel defaultSize={100 - splitSize} minSize={15}>
              <div className="h-full overflow-hidden">
                <GitTree />
              </div>
            </Panel>
          </PanelGroup>
        </div>
        {dashboardActive && (
          <div className="absolute inset-0 z-10 overflow-auto">
            <Dashboard />
          </div>
        )}
        {statisticsActive && (
          <div className="absolute inset-0 z-10 overflow-auto bg-zinc-950">
            <Statistics />
          </div>
        )}
        {usageActive && (
          <div className="absolute inset-0 z-10 overflow-auto bg-zinc-950">
            <Usage />
          </div>
        )}
        {settingsActive && (
          <div className="absolute inset-0 z-10 overflow-auto bg-zinc-950">
            <Settings />
          </div>
        )}
        {claudePageActive && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <ClaudePage />
          </div>
        )}
        {skillsPageActive && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <SkillsPage />
          </div>
        )}
        {terminalsPageActive && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <TerminalsPage />
          </div>
        )}
        {devServersPageActive && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <DevServersPage />
          </div>
        )}
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
