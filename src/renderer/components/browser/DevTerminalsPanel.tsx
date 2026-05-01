import { useEffect, useRef } from 'react'
import { useDevTerminalStore } from '@/stores/dev-terminal-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { TerminalInstance, disposeTerminal, focusTerminal } from '@/components/terminal/TerminalInstance'
import { Plus, X } from 'lucide-react'

function getGridLayout(count: number): { cols: number; rows: number[] } {
  const n = Math.max(1, count)
  return { cols: 1, rows: Array.from({ length: n }, () => 1) }
}

export function DevTerminalsPanel(): React.ReactElement {
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })

  const tabs = useDevTerminalStore((s) => s.tabs)
  const { createTab, closeTab, initProject } = useDevTerminalStore()
  const focusedTabId = useTerminalStore((s) => s.focusedTabId)

  const projectTabs = tabs.filter((t) => t.projectId === activeProject?.id)

  useEffect(() => {
    if (activeProject && projectTabs.length === 0) {
      initProject(activeProject.id, activeProject.path)
    }
  }, [activeProject?.id, projectTabs.length])

  const teardownInFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsubExit = window.api.terminal.onExit((tabId: string) => {
      if (teardownInFlight.current.has(tabId)) return
      teardownInFlight.current.add(tabId)
      const tab = useDevTerminalStore.getState().tabs.find((t) => t.id === tabId)
      if (tab) {
        disposeTerminal(tabId)
        useDevTerminalStore.getState().closeTab(tabId)
      }
      teardownInFlight.current.delete(tabId)
    })
    return () => unsubExit()
  }, [])

  const handleAdd = (): void => {
    if (!activeProject) return
    createTab(activeProject.id, activeProject.path)
  }

  const handleClose = (tabId: string): void => {
    if (teardownInFlight.current.has(tabId)) return
    teardownInFlight.current.add(tabId)
    window.api.terminal.kill(tabId)
    disposeTerminal(tabId)
    closeTab(tabId)
    teardownInFlight.current.delete(tabId)
  }

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Select a project first
      </div>
    )
  }

  const layout = getGridLayout(projectTabs.length)
  let tabIndex = 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50 px-1">
        <div className="flex-1" />
        <button
          onClick={handleAdd}
          disabled={projectTabs.length >= 6}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="New terminal"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        {projectTabs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            Initializing terminals...
          </div>
        ) : (
          <div className="flex flex-1 flex-col h-full" style={{ minHeight: 0 }}>
            {layout.rows.map((colCount, rowIdx) => (
              <div key={rowIdx} className="flex flex-1" style={{ minHeight: 0 }}>
                {Array.from({ length: colCount }).map((_, colIdx) => {
                  const tab = projectTabs[tabIndex]
                  tabIndex++
                  if (!tab) return null
                  const isFocused = focusedTabId === tab.id
                  return (
                    <div
                      key={tab.id}
                      className="relative flex flex-1 flex-col"
                      style={{
                        minWidth: 0,
                        minHeight: 0,
                        borderRight: colIdx < colCount - 1 ? '1px solid rgb(39 39 42)' : undefined,
                        borderBottom: rowIdx < layout.rows.length - 1 ? '1px solid rgb(39 39 42)' : undefined,
                        boxShadow: isFocused ? 'inset 0 0 0 1px rgb(96 165 250)' : undefined,
                        transition: 'box-shadow 120ms ease'
                      }}
                      onClick={() => focusTerminal(tab.id)}
                    >
                      <div
                        className={`flex items-center justify-between border-b px-2 py-0.5 ${
                          isFocused ? 'border-blue-400/40 bg-blue-400/10' : 'border-zinc-800 bg-zinc-900/50'
                        }`}
                      >
                        <span className={`text-[10px] ${isFocused ? 'text-blue-300' : 'text-zinc-500'}`}>
                          {tab.title}
                        </span>
                        <button
                          onClick={() => handleClose(tab.id)}
                          className="rounded p-0.5 text-zinc-600 hover:text-red-400"
                          disabled={projectTabs.length <= 1}
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
    </div>
  )
}
