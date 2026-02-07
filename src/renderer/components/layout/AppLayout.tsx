import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ProjectSelector } from '@/components/sidebar/ProjectSelector'
import { FileTree } from '@/components/sidebar/FileTree'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { BrowserPanel } from '@/components/browser/BrowserPanel'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { GitTree } from '@/components/git/GitTree'

export function AppLayout(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const hasOpenFile = useEditorStore(
    (s) => activeProjectId ? (s.statePerProject[activeProjectId]?.activeFilePath ?? null) !== null : false
  )

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/80 pl-20 pr-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold text-zinc-400">VibeCoder</span>
      </div>

      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={18} minSize={12} maxSize={30}>
          <div className="flex h-full flex-col border-r border-zinc-800 bg-zinc-900/30">
            <ProjectSelector />
            <div className="border-t border-zinc-800" />
            <div className="flex-1 overflow-y-auto">
              <FileTree />
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />

        <Panel defaultSize={52} minSize={20}>
          {hasOpenFile && activeProjectId ? <CodeEditor projectId={activeProjectId} /> : <BrowserPanel />}
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
    </div>
  )
}
