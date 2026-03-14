import { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { FileTree } from '@/components/sidebar/FileTree'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { BrowserPanel } from '@/components/browser/BrowserPanel'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { DevTerminalsPanel } from '@/components/browser/DevTerminalsPanel'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { GitTree } from '@/components/git/GitTree'
import { StatusBar } from '@/components/layout/StatusBar'
import { Globe, Code, Plus, X, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppLayout(): React.ReactElement {
  const { projects, activeProjectId, loadProjects, addProject, removeProject, setActiveProject } =
    useProjectStore()
  const centerTab = useEditorStore(
    (s) => activeProjectId ? (s.centerTabPerProject[activeProjectId] ?? 'browser') : 'browser'
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-0.5 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {[...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((project) => (
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

      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
        <Panel defaultSize={60} minSize={20}>
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
            <PanelGroup direction="vertical" className="flex-1 min-h-0">
              <Panel defaultSize={70} minSize={20}>
                <div className="h-full relative">
                  <div className={cn('absolute inset-0', centerTab === 'browser' ? 'z-10' : 'z-0 invisible')}>
                    <BrowserPanel />
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
              </Panel>
              <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
              <Panel defaultSize={30} minSize={10}>
                <DevTerminalsPanel />
              </Panel>
            </PanelGroup>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />

        <Panel defaultSize={40} minSize={15}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={35} minSize={15}>
              <GitTree />
            </Panel>
            <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
            <Panel defaultSize={65} minSize={20}>
              <TerminalPanel />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      <StatusBar />
    </div>
  )
}
