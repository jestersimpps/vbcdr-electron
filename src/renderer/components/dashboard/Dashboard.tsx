import { useCallback, useEffect, useState } from 'react'
import { Plus, Download, Check } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { ProjectCard } from '@/components/dashboard/ProjectCard'
import { ProjectModal } from '@/components/dashboard/ProjectModal'
import { WorkInProgress } from '@/components/dashboard/WorkInProgress'
import { ActivityLog } from '@/components/dashboard/ActivityLog'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import type { Project } from '@/models/types'

function PaneHeading({
  children,
  right
}: {
  children: React.ReactNode
  right?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-meta font-semibold uppercase tracking-wider text-zinc-500">
      {children}
      {right}
    </div>
  )
}

export function Dashboard(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const addProject = useProjectStore((s) => s.addProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const loadGitData = useGitStore((s) => s.loadGitData)
  const [modalProject, setModalProject] = useState<Project | null>(null)
  const [exportLog, setExportLog] = useState<{ run: () => Promise<void>; hasData: boolean } | null>(null)
  const [exported, setExported] = useState(false)

  const handleExportReady = useCallback(
    (fn: (() => Promise<void>) | null, hasData: boolean) => {
      setExportLog(fn ? { run: fn, hasData } : null)
    },
    []
  )

  const runExport = async (): Promise<void> => {
    if (!exportLog) return
    await exportLog.run()
    setExported(true)
    window.setTimeout(() => setExported(false), 2000)
  }

  const sorted = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  useEffect(() => {
    for (const project of projects) {
      loadGitData(project.id, project.path)
    }
  }, [projects, loadGitData])

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-600">
        <p className="text-sm">No projects yet</p>
        <button
          onClick={addProject}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        >
          <Plus size={12} />
          Add your first project
        </button>
      </div>
    )
  }

  return (
    <div className="h-full bg-zinc-950">
      <PanelGroup direction="horizontal" autoSaveId="vbcdr-dashboard-split">
        <Panel defaultSize={34} minSize={20}>
          <PanelGroup direction="vertical" autoSaveId="vbcdr-dashboard-left">
            <Panel defaultSize={40} minSize={15}>
              <div className="flex h-full flex-col overflow-hidden">
                <PaneHeading>In progress</PaneHeading>
                <div className="flex-1 overflow-y-auto">
                  <WorkInProgress onOpenProject={setActiveProject} />
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className="h-px bg-zinc-800 transition-colors hover:bg-zinc-600" />
            <Panel defaultSize={60} minSize={15}>
              <div className="flex h-full flex-col overflow-hidden">
                <PaneHeading
                  right={
                    <button
                      onClick={() => void runExport()}
                      disabled={!exportLog?.hasData}
                      title="Export activity log as markdown"
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-meta font-medium normal-case tracking-normal text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300 disabled:opacity-40"
                    >
                      {exported ? (
                        <Check size={11} className="text-emerald-400" />
                      ) : (
                        <Download size={11} />
                      )}
                      {exported ? 'Saved' : 'Export'}
                    </button>
                  }
                >
                  Activity
                </PaneHeading>
                <div className="flex-1 overflow-y-auto">
                  <ActivityLog onExportReady={handleExportReady} />
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="w-px bg-zinc-800 transition-colors hover:bg-zinc-600" />

        <Panel defaultSize={66} minSize={30}>
          <PanelGroup direction="vertical" autoSaveId="vbcdr-dashboard-right">
            <Panel defaultSize={50} minSize={20}>
              <div className="flex h-full flex-col overflow-hidden">
                <PaneHeading>Overview</PaneHeading>
                <div className="flex-1 overflow-y-auto">
                  <DashboardOverview />
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className="h-px bg-zinc-800 transition-colors hover:bg-zinc-600" />
            <Panel defaultSize={50} minSize={20}>
              <div className="h-full overflow-y-auto p-2">
                <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2">
                  {sorted.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onOpenModal={() => setModalProject(project)}
                    />
                  ))}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      {modalProject && (
        <ProjectModal project={modalProject} onClose={() => setModalProject(null)} />
      )}
    </div>
  )
}
