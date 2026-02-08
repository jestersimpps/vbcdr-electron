import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ProjectSelector } from '@/components/sidebar/ProjectSelector'
import { FileTree } from '@/components/sidebar/FileTree'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { BrowserPanel } from '@/components/browser/BrowserPanel'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { GitTree } from '@/components/git/GitTree'
import { StatusBar } from '@/components/layout/StatusBar'
import { Globe, Code } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppLayout(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const centerTab = useEditorStore(
    (s) => activeProjectId ? (s.centerTabPerProject[activeProjectId] ?? 'browser') : 'browser'
  )
  const setCenterTab = useEditorStore((s) => s.setCenterTab)

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20 pr-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold text-zinc-400">VibeCoder</span>
      </div>

      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
        <Panel defaultSize={18} minSize={12} maxSize={30}>
          <div className="flex h-full flex-col border-r border-zinc-800 bg-zinc-900/30">
            <ProjectSelector />
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />

        <Panel defaultSize={52} minSize={20}>
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
            <div className="flex-1 min-h-0 relative">
              <div className={cn('absolute inset-0', centerTab === 'browser' ? 'z-10' : 'z-0 invisible')}>
                <BrowserPanel />
              </div>
              <div className={cn('absolute inset-0', centerTab === 'editor' ? 'z-10' : 'z-0 invisible')}>
                {activeProjectId && (
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                      <div className="h-full overflow-y-auto border-r border-zinc-800 bg-zinc-900/30">
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
        </Panel>

        <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />

        <Panel defaultSize={30} minSize={15}>
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
