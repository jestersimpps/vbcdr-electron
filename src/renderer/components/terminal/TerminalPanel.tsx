import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { useTerminalStore, GLOBAL_TERMINAL_OWNER } from '@/stores/terminal-store'
import { useProjectStore } from '@/stores/project-store'
import { useThemeStore } from '@/stores/theme-store'
import { useEditorStore } from '@/stores/editor-store'
import { useLayoutStore } from '@/stores/layout-store'
import { TerminalInstance, disposeTerminal, applyThemeToAll, searchTerminal, clearTerminalSearch, focusTerminal, getTerminalInstance } from './TerminalInstance'
import { Plus, X, ChevronUp, ChevronDown, ArrowDownToLine, ArrowDownFromLine, Trash2, RotateCw, ImagePlus, Zap, Palette, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TerminalTab } from '@/models/types'
import { TERMINAL_THEMES, getTerminalTheme } from '@/config/terminal-theme-registry'
import { GitActions } from '@/components/git/GitActions'
import { TaskQueuePanel } from './TaskQueuePanel'
import { Sparkline } from './Sparkline'
import { useQueueRunner } from '@/hooks/useQueueRunner'
import { useTokenVelocity } from '@/hooks/useTokenVelocity'
import type { ITheme } from '@xterm/xterm'

const TERMINAL_THEME_OPTIONS = [
  { id: '', label: 'Auto' },
  ...Object.keys(TERMINAL_THEMES).map((id) => ({ id, label: id }))
]

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function tokenBarFill(pct: number, theme: ITheme): string {
  if (pct < 0.5) return theme.green ?? '#7ee787'
  if (pct < 0.75) return theme.yellow ?? '#ffa657'
  return theme.red ?? '#ff7b72'
}

const SortableTerminalTab = memo(function SortableTerminalTab({
  tab,
  isActive,
  status,
  onSelect,
  onClose
}: {
  tab: TerminalTab
  isActive: boolean
  status: 'idle' | 'busy' | undefined
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined
  }
  const handleSelect = useCallback(() => onSelect(tab.id), [onSelect, tab.id])
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose(tab.id)
  }, [onClose, tab.id])
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs',
        isActive ? 'bg-zinc-950 text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'
      )}
      onClick={handleSelect}
    >
      {tab.initialCommand && status === 'busy' && (
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
      )}
      {tab.initialCommand && status === 'idle' && (
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
      )}
      <span>{tab.title}</span>
      <button
        onClick={handleClose}
        onPointerDown={(e) => e.stopPropagation()}
        className="hidden rounded p-0.5 hover:text-red-400 group-hover:block"
        title="Close tab"
      >
        <X size={10} />
      </button>
    </div>
  )
})

interface TerminalPanelProps {
  global?: boolean
}

export function TerminalPanel({ global = false }: TerminalPanelProps = {}): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })

  const ownerId = global ? GLOBAL_TERMINAL_OWNER : activeProjectId
  const ownerCwd = global ? (activeProject?.path ?? '') : (activeProject?.path ?? '')
  const hasOwner = global || !!activeProject

  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabPerProject = useTerminalStore((s) => s.activeTabPerProject)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const replaceTab = useTerminalStore((s) => s.replaceTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const initProject = useTerminalStore((s) => s.initProject)
  const reorderTabs = useTerminalStore((s) => s.reorderTabs)
  const autoScrollPerTab = useTerminalStore((s) => s.autoScrollPerTab)
  const setAutoScroll = useTerminalStore((s) => s.setAutoScroll)

  const fullThemeId = useThemeStore((s) => s.getFullThemeId())
  const terminalThemeId = useThemeStore((s) => s.terminalThemeId)
  const setTerminalTheme = useThemeStore((s) => s.setTerminalTheme)
  const [terminalThemeOpen, setTerminalThemeOpen] = useState(false)
  const centerTab = useEditorStore((s) => activeProjectId ? s.centerTabPerProject[activeProjectId] ?? null : null)

  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const projectTabs = useMemo(
    () => tabs.filter((t) => t.projectId === ownerId),
    [tabs, ownerId]
  )
  const activeTabId = ownerId ? (activeTabPerProject[ownerId] || null) : null
  const activeTab = useMemo(
    () => projectTabs.find((t) => t.id === activeTabId),
    [projectTabs, activeTabId]
  )
  const projectTabIds = useMemo(() => projectTabs.map((t) => t.id), [projectTabs])

  const tokenVelocityTabId = activeTab?.initialCommand ? activeTabId : null
  const { velocityPerSample, tokensPerMinute } = useTokenVelocity(tokenVelocityTabId)

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
    if (global) {
      if (projectTabs.length === 0) {
        void initProject(GLOBAL_TERMINAL_OWNER, ownerCwd)
      }
      return
    }
    if (activeProject && projectTabs.length === 0) {
      void initProject(activeProject.id, activeProject.path)
    }
  }, [global, activeProject?.id, projectTabs.length, ownerCwd])

  const teardownInFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsubExit = window.api.terminal.onExit((tabId: string) => {
      if (teardownInFlight.current.has(tabId)) return
      teardownInFlight.current.add(tabId)
      const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
      if (tab) {
        disposeTerminal(tabId)
        useTerminalStore.getState().closeTab(tabId)
      }
      teardownInFlight.current.delete(tabId)
    })
    return () => unsubExit()
  }, [])

  const handleNewTab = (): void => {
    if (!hasOwner) return
    const cmd = useLayoutStore.getState().llmStartupCommand
    createTab(ownerId!, ownerCwd, cmd)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleTabDragEnd = useCallback((event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id || !ownerId) return
    const currentTabs = useTerminalStore.getState().tabs.filter((t) => t.projectId === ownerId)
    const fromIndex = currentTabs.findIndex((t) => t.id === active.id)
    const toIndex = currentTabs.findIndex((t) => t.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTabs(ownerId, fromIndex, toIndex)
    }
  }, [ownerId, reorderTabs])

  const handleCloseTab = useCallback((tabId: string): void => {
    if (teardownInFlight.current.has(tabId)) return
    teardownInFlight.current.add(tabId)
    window.api.terminal.kill(tabId)
    disposeTerminal(tabId)
    closeTab(tabId)
    teardownInFlight.current.delete(tabId)
  }, [closeTab])

  const handleSelectTab = useCallback((tabId: string): void => {
    if (ownerId) setActiveTab(ownerId, tabId)
  }, [ownerId, setActiveTab])

  const tokenCap = useLayoutStore((s) => s.tokenCap)

  useQueueRunner()

  return (
    <div data-terminal-panel style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex h-full flex-1 items-center gap-0.5 overflow-x-auto px-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
            <SortableContext items={projectTabIds} strategy={horizontalListSortingStrategy}>
              {projectTabs.map((tab) => (
                <SortableTerminalTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTabId === tab.id}
                  status={tabStatuses[tab.id]}
                  onSelect={handleSelectTab}
                  onClose={handleCloseTab}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <button
          onClick={handleNewTab}
          disabled={!hasOwner}
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
          onMouseDown={(e) => e.preventDefault()}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          title="Previous match"
        >
          <ChevronUp size={16} />
        </button>
        <button
          onClick={() => activeTabId && searchQuery && searchTerminal(activeTabId, searchQuery, 'next')}
          onMouseDown={(e) => e.preventDefault()}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          title="Next match"
        >
          <ChevronDown size={16} />
        </button>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        {(() => {
          const autoScroll = activeTabId ? (autoScrollPerTab[activeTabId] ?? true) : true
          return (
            <button
              onClick={() => {
                if (!activeTabId) return
                const next = !autoScroll
                setAutoScroll(activeTabId, next)
                if (next) scrollToBottom()
              }}
              disabled={!activeTabId}
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                'rounded p-1.5 transition-colors disabled:opacity-30',
                autoScroll
                  ? 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              )}
              title={autoScroll ? 'Auto-scroll on (click to pin position)' : 'Auto-scroll off (click to follow output)'}
            >
              {autoScroll ? <ArrowDownToLine size={16} /> : <ArrowDownFromLine size={16} />}
            </button>
          )
        })()}
        <button
          onClick={() => {
            if (!activeTabId) return
            window.api.terminal.pasteClipboardImage(activeTabId)
            focusTerminal(activeTabId)
          }}
          disabled={!activeTabId}
          onMouseDown={(e) => e.preventDefault()}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
          title="Paste screenshot from clipboard"
        >
          <ImagePlus size={16} />
        </button>
        <button
          onClick={() => {
            if (!activeTabId) return
            window.api.terminal.write(activeTabId, '/clear\r')
            focusTerminal(activeTabId)
          }}
          disabled={!activeTabId}
          onMouseDown={(e) => e.preventDefault()}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
          title="Clear context"
        >
          <Trash2 size={16} />
        </button>
        <button
          onClick={() => {
            if (!activeTabId || !ownerId) return
            const tabCwd = activeTab?.cwd ?? ownerCwd
            window.api.terminal.kill(activeTabId)
            disposeTerminal(activeTabId)
            replaceTab(activeTabId, ownerId, tabCwd, 'claude')
          }}
          disabled={!activeTabId}
          onMouseDown={(e) => e.preventDefault()}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
          title="Restart terminal"
        >
          <RotateCw size={16} />
        </button>
        <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
        {!global && (
          <>
            <GitActions />
            <div className="mx-0.5 h-3.5 w-px bg-zinc-700" />
          </>
        )}
        <button
          onClick={() => setTerminalThemeOpen(true)}
          onMouseDown={(e) => e.preventDefault()}
          className={cn('rounded p-1.5 hover:bg-zinc-700 hover:text-zinc-200', terminalThemeId ? 'text-blue-400' : 'text-zinc-400')}
          title="Terminal color theme"
        >
          <Palette size={16} />
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
        const pct = Math.min(tokens / tokenCap, 1)
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
            {velocityPerSample.length >= 2 && (
              <div
                className="flex items-center gap-1"
                title={`${tokensPerMinute.toLocaleString()} tokens/min (last 60s)`}
              >
                <Sparkline values={velocityPerSample} color={fill} fillColor={`${fill}20`} />
                <span className="shrink-0 text-micro tabular-nums" style={{ color: `${fill}aa` }}>
                  {formatTokens(tokensPerMinute)}/min
                </span>
              </div>
            )}
            <span className="shrink-0 text-micro tabular-nums" style={{ color: `${fill}aa` }}>
              {formatTokens(tokens)} / {formatTokens(tokenCap)}
            </span>
          </div>
        )
      })()}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {projectTabs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
            {hasOwner ? (
              <>
                <Sparkles size={28} className="text-zinc-600" />
                <button
                  onClick={handleNewTab}
                  className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/20"
                >
                  <Sparkles size={14} />
                  Start Claude Code here
                </button>
                <div className="text-micro text-zinc-600">or click + above for an empty shell</div>
              </>
            ) : (
              <div className="text-xs text-zinc-600">Select a project first</div>
            )}
          </div>
        )}
        {tabs.map((tab) => {
          const isVisible = tab.projectId === ownerId && activeTabId === tab.id
          return (
            <div
              key={tab.id}
              style={{
                position: 'absolute',
                inset: 0,
                visibility: isVisible ? 'visible' : 'hidden',
                pointerEvents: isVisible ? 'auto' : 'none'
              }}
            >
              <TerminalInstance
                tabId={tab.id}
                projectId={tab.projectId}
                cwd={tab.cwd}
                initialCommand={tab.initialCommand}
              />
            </div>
          )
        })}
      </div>

      <TaskQueuePanel tabId={activeTab?.initialCommand ? activeTabId : null} />
    </div>
  )
}
