import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ClaudeFileList } from '@/components/claude/ClaudeFileList'
import { ClaudeEditor } from '@/components/claude/ClaudeEditor'
import { GitTree } from '@/components/git/GitTree'
import { TerminalInstance } from '@/components/terminal/TerminalInstance'
import { useTerminalStore } from '@/stores/terminal-store'

const GLOBAL_PID = '__global__'
const GLOBAL_GIT_PID = '__claude__'

export function ClaudePage(): React.ReactElement {
  const [homeDir, setHomeDir] = useState<string | null>(null)
  const llmTab = useTerminalStore((s) =>
    s.tabs.find((t) => t.projectId === GLOBAL_PID && t.initialCommand)
  )
  const initProject = useTerminalStore((s) => s.initProject)

  useEffect(() => {
    let cancelled = false
    window.api.claude.homePath().then((p) => {
      if (!cancelled) setHomeDir(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!homeDir) return
    void initProject(GLOBAL_PID, homeDir)
  }, [homeDir, initProject])

  return (
    <div className="h-full bg-zinc-950">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={75} minSize={40}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={25} minSize={15} maxSize={40}>
              <div className="h-full overflow-hidden border-r border-zinc-800 bg-zinc-900">
                <ClaudeFileList projectId={GLOBAL_PID} scope="global" rootPath={homeDir ?? undefined} />
              </div>
            </Panel>
            <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
            <Panel defaultSize={75} minSize={30}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={50} minSize={20}>
                  <ClaudeEditor projectId={GLOBAL_PID} />
                </Panel>
                <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
                <Panel defaultSize={50} minSize={15}>
                  <div className="h-full bg-black">
                    {llmTab && homeDir ? (
                      <TerminalInstance
                        tabId={llmTab.id}
                        projectId={GLOBAL_PID}
                        cwd={homeDir}
                        initialCommand={llmTab.initialCommand}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                        Starting Claude…
                      </div>
                    )}
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
        <Panel defaultSize={25} minSize={15} maxSize={45}>
          <div className="h-full overflow-hidden border-l border-zinc-800 bg-zinc-900">
            <GitTree projectId={GLOBAL_GIT_PID} cwd={homeDir ?? undefined} llmTabProjectId={GLOBAL_PID} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
