import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Plus, ChevronUp, ChevronDown, ArrowDownToLine, Trash2, RotateCw, ImagePlus, Zap, ExternalLink } from 'lucide-react'
import { useTerminalStore } from '@/stores/terminal-store'
import { useProjectStore } from '@/stores/project-store'
import { useThemeStore } from '@/stores/theme-store'
import { useLayoutStore } from '@/stores/layout-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import { getTerminalInstance, disposeTerminal, searchTerminal, clearTerminalSearch, focusTerminal } from '@/components/terminal/TerminalInstance'
import { ModalTerminal } from '@/components/dashboard/ModalTerminal'
import { cn } from '@/lib/utils'
import type { Project, TerminalTab } from '@/models/types'
import type { ITheme } from '@xterm/xterm'

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function tokenBarFill(pct: number, theme: ITheme): string {
  if (pct < 0.5) return theme.green ?? '#7ee787'
  if (pct < 0.75) return theme.yellow ?? '#ffa657'
  return theme.red ?? '#ff7b72'
}

interface ProjectModalProps {
  project: Project
  onClose: () => void
}

export function ProjectModal({ project, onClose }: ProjectModalProps): React.ReactElement {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabPerProject = useTerminalStore((s) => s.activeTabPerProject)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const replaceTab = useTerminalStore((s) => s.replaceTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const initProject = useTerminalStore((s) => s.initProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const fullThemeId = useThemeStore((s) => s.getFullThemeId())
  const tokenCap = useLayoutStore((s) => s.tokenCap)

  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const projectTabs = tabs.filter((t) => t.projectId === project.id)
  const activeTabId = activeTabPerProject[project.id] || null
  const activeTab = projectTabs.find((t) => t.id === activeTabId) ?? null
  const hasInstance = activeTab ? !!getTerminalInstance(activeTab.id) : false

  useEffect(() => {
    initProject(project.id, project.path)
  }, [project.id, project.path, initProject])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const scrollToBottom = useCallback(() => {
    if (!activeTabId) return
    const entry = getTerminalInstance(activeTabId)
    if (entry) {
      entry.terminal.scrollToBottom()
      entry.terminal.focus()
    }
  }, [activeTabId])

  const handleNewTab = (): void => {
    createTab(project.id, project.path, 'claude')
  }

  const handleCloseTab = (tabId: string): void => {
    window.api.terminal.kill(tabId)
    disposeTerminal(tabId)
    closeTab(tabId)
  }

  const handleOpenWorkspace = (): void => {
    onClose()
    setActiveProject(project.id)
  }

  const claudeStatus = (() => {
    const llmTabs = projectTabs.filter((t) => t.initialCommand)
    if (llmTabs.length === 0) return 'none'
    if (llmTabs.some((t) => tabStatuses[t.id] === 'busy')) return 'busy'
    if (llmTabs.every((t) => tabStatuses[t.id] === 'idle')) return 'idle'
    return 'none'
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        style={{ width: '90vw', height: '90vh', maxWidth: 1400, maxHeight: 900 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'inline-block h-2 w-2 shrink-0 rounded-full',
                claudeStatus === 'busy' && 'animate-pulse bg-amber-400',
                claudeStatus === 'idle' && 'bg-emerald-400',
                claudeStatus === 'none' && 'bg-zinc-600'
              )}
            />
            <span className="text-sm font-medium text-zinc-200">{project.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenWorkspace}
              className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              <ExternalLink size={11} />
              Open Workspace
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {projectTabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  'group flex cursor-pointer items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs',
                  activeTabId === tab.id
                    ? 'bg-zinc-950 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-400'
                )}
                onClick={() => setActiveTab(project.id, tab.id)}
              >
                {tab.initialCommand && tabStatuses[tab.id] === 'busy' && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                )}
                {tab.initialCommand && tabStatuses[tab.id] === 'idle' && (
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                )}
                <span>{tab.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                  className="hidden rounded p-0.5 hover:text-red-400 group-hover:block"
                  title="Close tab"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleNewTab}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="New tab"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/80 px-2 py-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (activeTabId) {
                if (e.target.value) {
                  searchTerminal(activeTabId, e.target.value)
                } else {
                  clearTerminalSearch(activeTabId)
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && activeTabId && searchQuery) {
                searchTerminal(activeTabId, searchQuery, e.shiftKey ? 'previous' : 'next')
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setSearchQuery('')
                if (activeTabId) {
                  clearTerminalSearch(activeTabId)
                  focusTerminal(activeTabId)
                }
              }
            }}
            placeholder="Search..."
            className="h-6 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-200 outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => activeTabId && searchQuery && searchTerminal(activeTabId, searchQuery, 'previous')}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            title="Previous match"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => activeTabId && searchQuery && searchTerminal(activeTabId, searchQuery, 'next')}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            title="Next match"
          >
            <ChevronDown size={14} />
          </button>
          <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
          <button
            onClick={scrollToBottom}
            disabled={!activeTabId}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
            title="Scroll to bottom"
          >
            <ArrowDownToLine size={14} />
          </button>
          <button
            onClick={() => { if (activeTabId) window.api.terminal.write(activeTabId, '/clear\r') }}
            disabled={!activeTabId}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
            title="Clear context"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => { if (activeTabId) window.api.terminal.pasteClipboardImage(activeTabId) }}
            disabled={!activeTabId}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
            title="Paste screenshot from clipboard"
          >
            <ImagePlus size={14} />
          </button>
          <button
            onClick={() => {
              if (!activeTabId) return
              window.api.terminal.kill(activeTabId)
              disposeTerminal(activeTabId)
              replaceTab(activeTabId, project.id, project.path, 'claude')
            }}
            disabled={!activeTabId}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
            title="Restart terminal"
          >
            <RotateCw size={14} />
          </button>
        </div>

        {activeTab?.initialCommand && tokenUsagePerTab[activeTab.id] != null && (() => {
          const tokens = tokenUsagePerTab[activeTab.id]
          const pct = Math.min(tokens / tokenCap, 1)
          const theme = getTerminalTheme(fullThemeId)
          const fill = tokenBarFill(pct, theme)
          return (
            <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
              <Zap size={10} className="shrink-0" style={{ color: `${fill}80` }} />
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{ width: `${pct * 100}%`, backgroundColor: fill }}
                />
              </div>
              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: `${fill}aa` }}>
                {formatTokens(tokens)} / {formatTokens(tokenCap)}
              </span>
            </div>
          )
        })()}

        <div className="flex-1" style={{ minHeight: 0 }}>
          {projectTabs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              Click + to open a terminal
            </div>
          ) : hasInstance && activeTab ? (
            <ModalTerminal key={activeTab.id} tabId={activeTab.id} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              Loading terminal...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
