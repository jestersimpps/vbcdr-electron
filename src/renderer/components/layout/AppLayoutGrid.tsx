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
import { CompanionDock } from '@/components/companion/CompanionDock'
import { DiffPanel } from '@/components/git/DiffPanel'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { DevTerminalsPanel } from '@/components/terminal/DevTerminalsPanel'
import { FileTree } from '@/components/sidebar/FileTree'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useShortcutHintStore } from '@/stores/shortcut-hint-store'
import { StatusBar } from '@/components/layout/StatusBar'
import { PanelErrorBoundary } from '@/components/layout/PanelErrorBoundary'
import { useLlmCapabilities } from '@/hooks/useLlmCapabilities'
import { ClaudeFileList } from '@/components/claude/ClaudeFileList'
import { ClaudeEditor } from '@/components/claude/ClaudeEditor'
import { ClaudePage } from '@/components/claude/ClaudePage'
import { SkillsPanel } from '@/components/skills/SkillsPanel'
import { SkillsPage } from '@/components/skills/SkillsPage'
import { McpPage } from '@/components/mcp/McpPage'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { Statistics } from '@/components/statistics/Statistics'
import { Usage } from '@/components/usage/Usage'
import { Settings } from '@/components/settings/Settings'
import { TerminalsPage } from '@/components/terminal/TerminalsPage'
import { DevServersPage } from '@/components/dev-servers/DevServersPage'
import { VoicePage } from '@/components/voice/VoicePage'
import { SdlcPage } from '@/components/sdlc/SdlcPage'
import { SdlcPromptsPage } from '@/components/sdlc/SdlcPromptsPage'
import { isFeatureEnabled } from '@/config/feature-flags'
import { useTutorialStore } from '@/stores/tutorial-store'
import { Code, Bot, TerminalSquare, Wand2, Plus, X, FolderOpen, LayoutDashboard, PieChart, Gauge, GitCompareArrows, Server, Plug, Settings as SettingsIcon, GitBranch, PanelRightOpen, PanelLeftOpen, Mic, HelpCircle, Workflow } from 'lucide-react'
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
  onRemove,
  shortcutNumber
}: {
  project: Project
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
  shortcutNumber?: number
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
      {shortcutNumber && (
        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-zinc-700 px-1 font-mono text-[10px] text-zinc-200">
          {shortcutNumber}
        </span>
      )}
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
  const projectNumbersVisible = useShortcutHintStore((s) => s.projectNumbersVisible)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const dashboardActive = useProjectStore((s) => s.dashboardActive)
  const statisticsActive = useProjectStore((s) => s.statisticsActive)
  const usageActive = useProjectStore((s) => s.usageActive)
  const settingsActive = useProjectStore((s) => s.settingsActive)
  const claudePageActive = useProjectStore((s) => s.claudePageActive)
  const skillsPageActive = useProjectStore((s) => s.skillsPageActive)
  const mcpPageActive = useProjectStore((s) => s.mcpPageActive)
  const terminalsPageActive = useProjectStore((s) => s.terminalsPageActive)
  const devServersPageActive = useProjectStore((s) => s.devServersPageActive)
  const voicePageActive = useProjectStore((s) => s.voicePageActive)
  const sdlcPageActive = useProjectStore((s) => s.sdlcPageActive)
  const sdlcPromptsPageActive = useProjectStore((s) => s.sdlcPromptsPageActive)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const addProject = useProjectStore((s) => s.addProject)
  const removeProject = useProjectStore((s) => s.removeProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const reorderProjects = useProjectStore((s) => s.reorderProjects)
  const showDashboard = useProjectStore((s) => s.showDashboard)
  const showStatistics = useProjectStore((s) => s.showStatistics)
  const startTutorial = useTutorialStore((s) => s.startTutorial)
  const showUsage = useProjectStore((s) => s.showUsage)
  const showSettings = useProjectStore((s) => s.showSettings)
  const showClaudePage = useProjectStore((s) => s.showClaudePage)
  const showSkillsPage = useProjectStore((s) => s.showSkillsPage)
  const showMcpPage = useProjectStore((s) => s.showMcpPage)
  const showTerminalsPage = useProjectStore((s) => s.showTerminalsPage)
  const showDevServersPage = useProjectStore((s) => s.showDevServersPage)
  const showVoicePage = useProjectStore((s) => s.showVoicePage)
  const showSdlcPage = useProjectStore((s) => s.showSdlcPage)
  const llmCapabilities = useLlmCapabilities()
  const voiceEnabled = isFeatureEnabled('voiceControl')
  const anyPageActive = dashboardActive || statisticsActive || usageActive || settingsActive || claudePageActive || skillsPageActive || mcpPageActive || terminalsPageActive || devServersPageActive || sdlcPageActive || sdlcPromptsPageActive || (voicePageActive && voiceEnabled)
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
  const toggleGitCollapsed = useLayoutStore((s) => s.toggleGitCollapsed)
  const toggleDevTerminalsCollapsed = useLayoutStore((s) => s.toggleDevTerminalsCollapsed)

  const projectId = activeProjectId ?? '__default__'
  const splitSize = getSplit(projectId)
  const gitCollapsed = useLayoutStore((s) => !!s.gitCollapsedPerProject[projectId])
  const companionEnabled = useLayoutStore((s) => s.companionEnabled)
  const devTerminalsCollapsed = useLayoutStore((s) => !!s.devTerminalsCollapsedPerProject[projectId])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const stranded =
      (claudePageActive && !llmCapabilities.configFiles) ||
      (skillsPageActive && !llmCapabilities.skills) ||
      (mcpPageActive && !llmCapabilities.mcp)
    if (stranded) showDashboard()
  }, [
    claudePageActive,
    skillsPageActive,
    mcpPageActive,
    llmCapabilities,
    showDashboard
  ])

  useEffect(() => {
    if (!activeProjectId) return
    const strandedTab =
      (centerTab === 'claude' && !llmCapabilities.configFiles) ||
      (centerTab === 'skills' && !llmCapabilities.skills)
    if (strandedTab) setCenterTab(activeProjectId, 'terminals')
  }, [activeProjectId, centerTab, llmCapabilities, setCenterTab])

  const activeProjectPath = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)?.path ?? null
    : null

  const renderWorkspacePanel = (): React.ReactNode => (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={() => activeProjectId && setCenterTab(activeProjectId, 'terminals')}
          data-tour="tab-terminals"
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
          data-tour="tab-editor"
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
          data-tour="tab-diff"
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
        {llmCapabilities.configFiles && (
          <button
            onClick={() => activeProjectId && setCenterTab(activeProjectId, 'claude')}
            data-tour="tab-claude"
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
        )}
        {llmCapabilities.skills && (
          <button
            onClick={() => activeProjectId && setCenterTab(activeProjectId, 'skills')}
            data-tour="tab-skills"
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
        )}
        {activeProjectPath && (
          <button
            onClick={() => window.api.fs.openFolder(activeProjectPath)}
            data-tour="open-project-folder"
            className="ml-auto flex h-full items-center gap-1.5 px-3 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
            title="Open project folder"
          >
            <FolderOpen size={12} />
            Open project folder
          </button>
        )}
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className={cn('absolute inset-0 bg-zinc-950', centerTab === 'terminals' ? 'z-10' : 'z-0 invisible')}>
          <PanelErrorBoundary label="Terminals">
            {devTerminalsCollapsed ? (
              <div className="flex h-full">
                <div className="flex w-8 shrink-0 flex-col items-center gap-1.5 border-r border-zinc-800 bg-zinc-900/50 py-2">
                  <button
                    onClick={() => toggleDevTerminalsCollapsed(projectId)}
                    data-tour="devterms-expand"
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    title="Expand dev terminals"
                  >
                    <PanelLeftOpen size={14} />
                  </button>
                  <TerminalSquare size={13} className="text-zinc-600" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <TerminalPanel />
                </div>
              </div>
            ) : (
              <PanelGroup direction="horizontal">
                <Panel defaultSize={35} minSize={15}>
                  <DevTerminalsPanel onCollapse={() => toggleDevTerminalsCollapsed(projectId)} />
                </Panel>
                <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
                <Panel defaultSize={65} minSize={20}>
                  <TerminalPanel />
                </Panel>
              </PanelGroup>
            )}
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
          <div className="flex items-center h-full min-w-0 flex-1" data-tour="project-tabs">
            <DndContext sensors={projectTabSensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
              <SortableContext items={projects.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                {projects.map((project, index) => (
                  <SortableProjectTab
                    key={project.id}
                    project={project}
                    isActive={activeProjectId === project.id && !anyPageActive}
                    onSelect={() => {
                      setActiveProject(project.id)
                      useTerminalStore.getState().clearProjectAttention(project.id)
                    }}
                    onRemove={() => removeProject(project.id)}
                    shortcutNumber={projectNumbersVisible && index < 9 ? index + 1 : undefined}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          <button
            onClick={addProject}
            data-tour="add-project"
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
              data-tour="nav-dashboard"
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
              onClick={showSdlcPage}
              data-tour="nav-sdlc"
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded transition-colors',
                sdlcPageActive
                  ? 'text-zinc-200 bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              )}
              title="Agent SDLC"
            >
              <Workflow size={18} />
            </button>
            {llmCapabilities.configFiles && (
              <button
                onClick={showClaudePage}
                data-tour="nav-claude"
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
            )}
            {llmCapabilities.skills && (
              <button
                onClick={showSkillsPage}
                data-tour="nav-skills"
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
            )}
            {llmCapabilities.mcp && (
              <button
                onClick={showMcpPage}
                data-tour="nav-mcp"
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded transition-colors',
                  mcpPageActive
                    ? 'text-zinc-200 bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                )}
                title="MCP Servers"
              >
                <Plug size={18} />
              </button>
            )}
            <button
              onClick={showTerminalsPage}
              data-tour="nav-terminals"
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
              data-tour="nav-devservers"
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
            {voiceEnabled && (
              <button
                onClick={showVoicePage}
                data-tour="nav-voice"
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded transition-colors',
                  voicePageActive
                    ? 'text-zinc-200 bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                )}
                title="Voice"
              >
                <Mic size={18} />
              </button>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={startTutorial}
              data-tour="nav-tutorial"
              className="flex h-10 w-10 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300"
              title="Interactive tutorial"
            >
              <HelpCircle size={18} />
            </button>
            <button
              onClick={showStatistics}
              data-tour="nav-statistics"
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
              data-tour="nav-usage"
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
              onClick={showSettings}
              data-tour="nav-settings"
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
          </div>
        </nav>
        <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ visibility: anyPageActive ? 'hidden' : 'visible' }}
        >
          {gitCollapsed ? (
            <div className="flex h-full">
              <div className="min-w-0 flex-1 overflow-hidden">
                {renderWorkspacePanel()}
              </div>
              <div className="flex w-8 shrink-0 flex-col items-center gap-1.5 border-l border-zinc-800 bg-zinc-900/50 py-2">
                <button
                  onClick={() => toggleGitCollapsed(projectId)}
                  data-tour="git-expand"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  title="Expand git panel"
                >
                  <PanelRightOpen size={14} />
                </button>
                <GitBranch size={13} className="text-zinc-600" />
              </div>
            </div>
          ) : (
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
                {companionEnabled ? (
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={70} minSize={25}>
                      <div className="h-full overflow-hidden">
                        <GitTree onCollapse={() => toggleGitCollapsed(projectId)} />
                      </div>
                    </Panel>
                    <PanelResizeHandle className="h-px bg-zinc-800 transition-colors hover:bg-zinc-600" />
                    <Panel defaultSize={30} minSize={12}>
                      <CompanionDock />
                    </Panel>
                  </PanelGroup>
                ) : (
                  <div className="h-full overflow-hidden">
                    <GitTree onCollapse={() => toggleGitCollapsed(projectId)} />
                  </div>
                )}
              </Panel>
            </PanelGroup>
          )}
        </div>
        {dashboardActive && (
          <div className="absolute inset-0 z-10 overflow-hidden">
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
        {claudePageActive && llmCapabilities.configFiles && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <ClaudePage />
          </div>
        )}
        {skillsPageActive && llmCapabilities.skills && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <SkillsPage />
          </div>
        )}
        {mcpPageActive && llmCapabilities.mcp && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <McpPage />
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
        {sdlcPageActive && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <SdlcPage />
          </div>
        )}
        {sdlcPromptsPageActive && (
          <div className="absolute inset-0 z-10 overflow-auto bg-zinc-950">
            <SdlcPromptsPage />
          </div>
        )}
        {voicePageActive && voiceEnabled && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-zinc-950">
            <VoicePage />
          </div>
        )}
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
