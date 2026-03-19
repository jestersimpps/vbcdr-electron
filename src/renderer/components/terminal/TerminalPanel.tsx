import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTerminalStore } from '@/stores/terminal-store'
import { useProjectStore } from '@/stores/project-store'
import { useThemeStore } from '@/stores/theme-store'
import { useEditorStore } from '@/stores/editor-store'
import { TerminalInstance, disposeTerminal, applyThemeToAll, searchTerminal, clearTerminalSearch, focusTerminal, getTerminalInstance } from './TerminalInstance'
import { Plus, X, ChevronUp, ChevronDown, ArrowDownToLine, Trash2, RotateCw, ImagePlus, Zap, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TERMINAL_THEMES, getTerminalTheme } from '@/config/terminal-theme-registry'
import type { ITheme } from '@xterm/xterm'

const TERMINAL_THEME_OPTIONS = [
  { id: '', label: 'Auto' },
  ...Object.keys(TERMINAL_THEMES).map((id) => ({ id, label: id }))
]

const MAX_TOKENS = 160_000

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function tokenBarFill(pct: number, theme: ITheme): string {
  if (pct < 0.5) return theme.green ?? '#7ee787'
  if (pct < 0.75) return theme.yellow ?? '#ffa657'
  return theme.red ?? '#ff7b72'
}

export function TerminalPanel(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })

  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabPerProject = useTerminalStore((s) => s.activeTabPerProject)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const { createTab, closeTab, replaceTab, setActiveTab, initProject } = useTerminalStore()

  const fullThemeId = useThemeStore((s) => s.getFullThemeId())
  const terminalThemeId = useThemeStore((s) => s.terminalThemeId)
  const setTerminalTheme = useThemeStore((s) => s.setTerminalTheme)
  const [terminalThemeOpen, setTerminalThemeOpen] = useState(false)
  const centerTab = useEditorStore((s) => activeProjectId ? s.centerTabPerProject[activeProjectId] ?? null : null)

  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId)
  const activeTabId = activeProjectId ? (activeTabPerProject[activeProjectId] || null) : null
  const activeTab = projectTabs.find((t) => t.id === activeTabId)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        const el = (e.target as HTMLElement)?.closest?.('[data-terminal-panel]')
        if (!el) return
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (!activeTabId) return
    const entry = getTerminalInstance(activeTabId)
    if (entry) {
      entry.terminal.scrollToBottom()
      entry.terminal.focus()
    }
  }, [activeTabId])

  useEffect(() => {
    applyThemeToAll(useThemeStore.getState().getTerminalThemeId())
  }, [fullThemeId, terminalThemeId])


  useEffect(() => {
    if (!activeTabId) return
    const timer = setTimeout(() => focusTerminal(activeTabId), 50)
    return () => clearTimeout(timer)
  }, [activeTabId, centerTab])

  useEffect(() => {
    if (activeProject) {
      initProject(activeProject.id, activeProject.path)
    }
  }, [activeProject?.id])

  useEffect(() => {
    const unsubExit = window.api.terminal.onExit((tabId: string) => {
      const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
      if (tab) {
        disposeTerminal(tabId)
        useTerminalStore.getState().closeTab(tabId)
      }
    })
    return () => unsubExit()
  }, [])

  const handleNewTab = (): void => {
    if (!activeProject) return
    createTab(activeProject.id, activeProject.path, 'claude')
  }

  const handleCloseTab = (tabId: string): void => {
    window.api.terminal.kill(tabId)
    disposeTerminal(tabId)
    closeTab(tabId)
  }

  return (
    <div data-terminal-panel className="bg-zinc-950" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
              onClick={() => activeProjectId && setActiveTab(activeProjectId, tab.id)}
            >
              {tab.initialCommand && tabStatuses[tab.id] === 'busy' && (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              )}
              {tab.initialCommand && tabStatuses[tab.id] === 'idle' && (
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              )}
              <span>{tab.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseTab(tab.id)
                }}
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
          disabled={!activeProject}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
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
          onClick={() => {
            if (!activeTabId) return
            window.api.terminal.write(activeTabId, '/clear\r')
          }}
          disabled={!activeTabId}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
          title="Clear context"
        >
          <Trash2 size={14} />
        </button>
        <button
          onClick={() => {
            if (activeTabId) window.api.terminal.pasteClipboardImage(activeTabId)
          }}
          disabled={!activeTabId}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
          title="Paste screenshot from clipboard"
        >
          <ImagePlus size={14} />
        </button>
        <button
          onClick={() => {
            if (!activeTabId || !activeProject) return
            window.api.terminal.kill(activeTabId)
            disposeTerminal(activeTabId)
            replaceTab(activeTabId, activeProject.id, activeProject.path, 'claude')
          }}
          disabled={!activeTabId}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
          title="Restart terminal"
        >
          <RotateCw size={14} />
        </button>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        <button
          onClick={() => setTerminalThemeOpen(true)}
          className={cn('rounded p-0.5 hover:bg-zinc-700 hover:text-zinc-200', terminalThemeId ? 'text-blue-400' : 'text-zinc-400')}
          title="Terminal color theme"
        >
          <Palette size={14} />
        </button>
        {terminalThemeOpen && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setTerminalThemeOpen(false) }}
          >
            <div className="w-56 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400">Terminal Theme</div>
              <div className="py-1 max-h-80 overflow-y-auto">
                {TERMINAL_THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setTerminalTheme(opt.id)
                      applyThemeToAll(opt.id || useThemeStore.getState().getTerminalThemeId())
                      setTerminalThemeOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-800',
                      terminalThemeId === opt.id ? 'text-blue-400' : 'text-zinc-300'
                    )}
                  >
                    {terminalThemeId === opt.id ? <span className="text-blue-400">✓</span> : <span className="w-3" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      {activeTab?.initialCommand && tokenUsagePerTab[activeTab.id] != null && (() => {
        const tokens = tokenUsagePerTab[activeTab.id]
        const pct = Math.min(tokens / MAX_TOKENS, 1)
        const theme = getTerminalTheme(useThemeStore.getState().getTerminalThemeId())
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
              {formatTokens(tokens)} / {formatTokens(MAX_TOKENS)}
            </span>
          </div>
        )
      })()}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {projectTabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            {activeProject ? 'Click + to open a terminal' : 'Select a project first'}
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              visibility:
                tab.projectId === activeProjectId && activeTabId === tab.id ? 'visible' : 'hidden'
            }}
          >
            <TerminalInstance
              tabId={tab.id}
              projectId={tab.projectId}
              cwd={tab.cwd}
              initialCommand={tab.initialCommand}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
