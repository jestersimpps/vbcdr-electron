import { useEffect } from 'react'
import { useDevTerminalStore } from '@/stores/dev-terminal-store'
import { useProjectStore } from '@/stores/project-store'
import { TerminalInstance, disposeTerminal, focusTerminal } from '@/components/terminal/TerminalInstance'
import { Plus, X } from 'lucide-react'

function getGridLayout(count: number): { cols: number; rows: number[] } {
  switch (count) {
    case 1: return { cols: 1, rows: [1] }
    case 2: return { cols: 1, rows: [1, 1] }
    case 3: return { cols: 2, rows: [2, 1] }
    case 4: return { cols: 2, rows: [2, 2] }
    case 5: return { cols: 3, rows: [3, 2] }
    case 6: return { cols: 3, rows: [3, 3] }
    default: return { cols: 3, rows: [3, 3] }
  }
}

export function DevTerminalsPanel(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })

  const tabs = useDevTerminalStore((s) => s.tabs)
  const { createTab, closeTab, initProject } = useDevTerminalStore()

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId)

  useEffect(() => {
    if (activeProject) {
      initProject(activeProject.id, activeProject.path)
    }
  }, [activeProject?.id])

  useEffect(() => {
    const unsubExit = window.api.terminal.onExit((tabId: string) => {
      const tab = useDevTerminalStore.getState().tabs.find((t) => t.id === tabId)
      if (tab) {
        disposeTerminal(tabId)
        useDevTerminalStore.getState().closeTab(tabId)
      }
    })
    return () => unsubExit()
  }, [])

  const handleAdd = (): void => {
    if (!activeProject) return
    createTab(activeProject.id, activeProject.path)
  }

  const handleClose = (tabId: string): void => {
    window.api.terminal.kill(tabId)
    disposeTerminal(tabId)
    closeTab(tabId)
  }

  const projectIds = [...new Set(tabs.map((t) => t.projectId))]

  if (!activeProject && projectIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Select a project first
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        {projectIds.map((pid) => {
          const pTabs = tabs.filter((t) => t.projectId === pid)
          const isActive = pid === activeProjectId
          const layout = getGridLayout(pTabs.length)
          let tabIndex = 0

          return (
            <div
              key={pid}
              className="absolute inset-0 flex flex-col"
              style={{ visibility: isActive ? 'visible' : 'hidden', zIndex: isActive ? 1 : 0 }}
            >
              {pTabs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                  Initializing terminals...
                </div>
              ) : (
                <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
                  {layout.rows.map((colCount, rowIdx) => (
                    <div key={rowIdx} className="flex flex-1" style={{ minHeight: 0 }}>
                      {Array.from({ length: colCount }).map((_, colIdx) => {
                        const tab = pTabs[tabIndex]
                        tabIndex++
                        if (!tab) return null
                        return (
                          <div
                            key={tab.id}
                            className="flex flex-1 flex-col"
                            style={{
                              minWidth: 0,
                              minHeight: 0,
                              borderRight: colIdx < colCount - 1 ? '1px solid rgb(39 39 42)' : undefined,
                              borderBottom: rowIdx < layout.rows.length - 1 ? '1px solid rgb(39 39 42)' : undefined
                            }}
                            onClick={() => focusTerminal(tab.id)}
                          >
                            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2 py-0.5">
                              <span className="text-[10px] text-zinc-500">{tab.title}</span>
                              <button
                                onClick={() => handleClose(tab.id)}
                                className="rounded p-0.5 text-zinc-600 hover:text-red-400"
                                disabled={pTabs.length <= 1}
                                title="Close terminal"
                              >
                                <X size={10} />
                              </button>
                            </div>
                            <div className="flex-1" style={{ minHeight: 0 }}>
                              <TerminalInstance tabId={tab.id} projectId={tab.projectId} cwd={tab.cwd} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center border-t border-zinc-800 bg-zinc-900/50 px-2 py-0.5">
        <button
          onClick={handleAdd}
          disabled={projectTabs.length >= 6}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
        >
          <Plus size={10} />
          Add Terminal
        </button>
      </div>
    </div>
  )
}
