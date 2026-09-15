import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Folder,
  Terminal,
  FileText,
  Play,
  Settings,
  BarChart3,
  Activity,
  ArrowRight,
  Plus,
  X,
  Save,
  RotateCw,
  Trash2,
  Sun,
  Moon,
  Eye,
  ImagePlus,
  RefreshCw,
  ListPlus,
  Code,
  Sparkles
} from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useEditorStore } from '@/stores/editor-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useLayoutStore } from '@/stores/layout-store'
import { capabilitiesFor, clearContextCommandFor, providerDefinition } from '@/config/llm-provider-registry'
import { useQueueStore } from '@/stores/queue-store'
import { useThemeStore } from '@/stores/theme-store'
import { useTutorialStore } from '@/stores/tutorial-store'
import { sendToTerminalViaPty } from '@/lib/send-to-terminal'
import { fuzzyMatch } from '@/lib/fuzzy'
import { flattenTree } from '@/lib/flatten-tree'
import type { FlatFile } from '@/lib/flatten-tree'
import { dispatchAppAction } from '@/lib/app-actions'
import { cn } from '@/lib/utils'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  run: () => void
}

const MAX_FILE_RESULTS = 30

// Stable singletons: returning a fresh [] from the guarded memos above would
// defeat their own memoization for every downstream dependency.
const EMPTY_FILES: FlatFile[] = []
const EMPTY_ITEMS: PaletteItem[] = []

type PaletteMode = 'all' | 'files'

export function CommandPalette(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PaletteMode>('all')
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const paletteLlmLabel = providerDefinition(useLayoutStore((s) => s.llmProviderId)).label

  useEffect(() => {
    const handleOpenEvent = (e: Event): void => {
      const detail = (e as CustomEvent<{ mode?: PaletteMode; open?: boolean }>).detail
      if (detail?.open === false) {
        setOpen(false)
        return
      }
      const nextMode: PaletteMode = detail?.mode === 'files' ? 'files' : 'all'
      if (detail?.open === true) {
        setMode(nextMode)
        setOpen(true)
        return
      }
      setOpen((prev) => {
        if (prev && mode === nextMode) return false
        setMode(nextMode)
        return true
      })
    }
    window.addEventListener('palette:open', handleOpenEvent)
    return () => {
      window.removeEventListener('palette:open', handleOpenEvent)
    }
  }, [mode])

  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      restoreFocusRef.current?.focus?.()
      restoreFocusRef.current = null
    }
  }, [open, mode])

  const close = useCallback(() => setOpen(false), [])

  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const terminalTabs = useTerminalStore((s) => s.tabs)
  const itemsPerTab = useQueueStore((s) => s.itemsPerTab)
  const activeTabPerProject = useTerminalStore((s) => s.activeTabPerProject)
  const treePerProject = useFileTreeStore((s) => s.treePerProject)
  const editorStatePerProject = useEditorStore((s) => s.statePerProject)

  const activeLlmTabId = useMemo(() => {
    if (!activeProjectId) return null
    const tabId = activeTabPerProject[activeProjectId] ?? null
    if (!tabId) return null
    const tab = terminalTabs.find((t) => t.id === tabId)
    return tab?.initialCommand ? tabId : null
  }, [activeProjectId, activeTabPerProject, terminalTabs])

  const queueItems = useMemo(
    () => (activeLlmTabId ? itemsPerTab[activeLlmTabId] ?? [] : []),
    [activeLlmTabId, itemsPerTab]
  )
  const fileTree = activeProjectId ? treePerProject[activeProjectId] : undefined
  const openFiles = useMemo(
    () => (activeProjectId ? editorStatePerProject[activeProjectId]?.openFiles ?? [] : []),
    [activeProjectId, editorStatePerProject]
  )

  // The palette is mounted unconditionally by App, and its `if (!open) return null`
  // lives at the bottom of the component - so without these `open` guards the memos
  // below run for the whole session. On a large repo that means flattening a
  // 30,000-node tree and building a PaletteItem per file (each carrying its own
  // <FileText/> element and closure) over and over while the palette is closed.
  // Measured before this guard: 60.5% of total profile time, with React element
  // creation alone at 39.1%.
  const allFiles = useMemo(() => (open ? flattenTree(fileTree) : EMPTY_FILES), [open, fileTree])
  const recentFilePaths = useMemo(() => [...openFiles].reverse().map((f) => f.path), [openFiles])

  const items = useMemo((): PaletteItem[] => {
    if (!open) return EMPTY_ITEMS
    const list: PaletteItem[] = []

    for (const p of projects) {
      list.push({
        id: `project:${p.id}`,
        label: p.name,
        hint: p.path,
        group: 'Switch project',
        icon: <Folder size={14} />,
        run: () => useProjectStore.getState().setActiveProject(p.id)
      })
    }

    if (activeProjectId) {
      const projectTabs = terminalTabs.filter((t) => t.projectId === activeProjectId)
      for (const t of projectTabs) {
        list.push({
          id: `terminal:${t.id}`,
          label: t.title,
          hint: t.initialCommand ?? 'shell',
          group: 'Switch terminal',
          icon: <Terminal size={14} />,
          run: () => useTerminalStore.getState().setActiveTab(activeProjectId, t.id)
        })
      }

      const project = projects.find((p) => p.id === activeProjectId)
      if (project) {
        for (const f of allFiles) {
          list.push({
            id: `file:${f.path}`,
            label: f.name,
            hint: f.path.replace(project.path, '').replace(/^\//, ''),
            group: 'Open file',
            icon: <FileText size={14} />,
            run: () => {
              void useEditorStore.getState().openFile(activeProjectId, f.path, f.name, project.path)
            }
          })
        }
      }

      for (const q of queueItems) {
        list.push({
          id: `queue:${q.id}`,
          label: q.text.length > 60 ? q.text.slice(0, 60) + '…' : q.text,
          hint: 'send to active LLM terminal',
          group: 'Run queued command',
          icon: <Play size={14} />,
          run: () => {
            if (!activeLlmTabId) return
            useQueueStore.getState().removeItem(activeLlmTabId, q.id)
            sendToTerminalViaPty(activeLlmTabId, q.text)
          }
        })
      }

      const llmProviderId = useLayoutStore.getState().llmProviderId
      const llmLabel = providerDefinition(llmProviderId).label
      const clearContextCommand = clearContextCommandFor(llmProviderId)

      list.push(
        {
          id: 'action:new-llm-terminal',
          label: `New ${llmLabel} terminal`,
          hint: 'opens a new LLM tab',
          group: 'Terminal',
          icon: <Sparkles size={14} />,
          run: () => dispatchAppAction({ action: 'new-claude-terminal' })
        },
        {
          id: 'action:new-shell',
          label: 'New shell terminal',
          group: 'Terminal',
          icon: <Plus size={14} />,
          run: () => dispatchAppAction({ action: 'new-shell-terminal' })
        },
        {
          id: 'action:restart-llm',
          label: 'Restart active LLM terminal',
          group: 'Terminal',
          icon: <RotateCw size={14} />,
          run: () => dispatchAppAction({ action: 'restart-claude' })
        },
        ...(clearContextCommand
          ? [
              {
                id: 'action:clear-context',
                label: `Clear LLM context (${clearContextCommand})`,
                group: 'Terminal',
                icon: <Trash2 size={14} />,
                run: (): void => {
                  dispatchAppAction({ action: 'clear-context' })
                }
              }
            ]
          : []),
        {
          id: 'action:paste-screenshot',
          label: 'Paste screenshot to terminal',
          group: 'Terminal',
          icon: <ImagePlus size={14} />,
          run: () => dispatchAppAction({ action: 'paste-screenshot' })
        }
      )

      list.push(
        {
          id: 'action:save-file',
          label: 'Save current file',
          group: 'Editor',
          icon: <Save size={14} />,
          run: () => dispatchAppAction({ action: 'save-file' })
        },
        {
          id: 'action:close-file',
          label: 'Close current file tab',
          group: 'Editor',
          icon: <X size={14} />,
          run: () => dispatchAppAction({ action: 'close-file-tab' })
        },
        {
          id: 'action:center-editor',
          label: 'Show editor',
          group: 'Editor',
          icon: <Code size={14} />,
          run: () => dispatchAppAction({ action: 'center-tab-editor' })
        },
        ...(capabilitiesFor(llmProviderId).configFiles
          ? [
              {
                id: 'action:center-claude',
                label: 'Show Claude config',
                group: 'Editor',
                icon: <Settings size={14} />,
                run: (): void => {
                  dispatchAppAction({ action: 'center-tab-claude' })
                }
              }
            ]
          : [])
      )

      list.push(
        {
          id: 'action:reload-tree',
          label: 'Reload file tree',
          group: 'Project',
          icon: <RefreshCw size={14} />,
          run: () => dispatchAppAction({ action: 'reload-tree' })
        },
        {
          id: 'action:close-project',
          label: 'Close current project',
          group: 'Project',
          icon: <X size={14} />,
          run: () => dispatchAppAction({ action: 'close-project' })
        }
      )

      const trimmed = query.trim()
      if (trimmed.length > 0 && activeLlmTabId) {
        const preview = trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed
        list.push({
          id: 'action:enqueue',
          label: `Send to LLM: "${preview}"`,
          hint: 'enter to queue · press play to start auto-run',
          group: 'Prompt',
          icon: <ListPlus size={14} />,
          run: () => {
            useQueueStore.getState().addItem(activeLlmTabId, trimmed)
          }
        })
      }
    }

    list.push(
      {
        id: 'action:new-project',
        label: 'New project (open folder)',
        group: 'Project',
        icon: <Folder size={14} />,
        run: () => dispatchAppAction({ action: 'new-project' })
      },
      {
        id: 'action:toggle-variant',
        label: 'Toggle dark / light mode',
        group: 'Theme',
        icon: useThemeStore.getState().variant === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        run: () => dispatchAppAction({ action: 'toggle-variant' })
      },
      {
        id: 'action:toggle-minimap',
        label: 'Toggle editor minimap',
        group: 'Editor',
        icon: <Eye size={14} />,
        run: () => dispatchAppAction({ action: 'toggle-minimap' })
      },
      {
        id: 'action:toggle-autosave',
        label: 'Toggle autosave',
        group: 'Editor',
        icon: <Save size={14} />,
        run: () => dispatchAppAction({ action: 'toggle-autosave' })
      },
      {
        id: 'action:toggle-format-on-save',
        label: 'Toggle format on save',
        group: 'Editor',
        icon: <Save size={14} />,
        run: () => dispatchAppAction({ action: 'toggle-format-on-save' })
      }
    )

    list.push(
      {
        id: 'nav:dashboard',
        label: 'Dashboard',
        group: 'Go to',
        icon: <ArrowRight size={14} />,
        run: () => useProjectStore.getState().showDashboard()
      },
      {
        id: 'nav:tutorial',
        label: 'Start interactive tutorial',
        group: 'Go to',
        icon: <ArrowRight size={14} />,
        run: () => useTutorialStore.getState().startTutorial()
      },
      {
        id: 'nav:statistics',
        label: 'Statistics',
        group: 'Go to',
        icon: <BarChart3 size={14} />,
        run: () => useProjectStore.getState().showStatistics()
      },
      {
        id: 'nav:usage',
        label: 'Usage',
        group: 'Go to',
        icon: <Activity size={14} />,
        run: () => useProjectStore.getState().showUsage()
      },
      {
        id: 'nav:settings',
        label: 'Settings',
        group: 'Go to',
        icon: <Settings size={14} />,
        run: () => useProjectStore.getState().showSettings()
      }
    )

    return list
  }, [open, projects, activeProjectId, activeLlmTabId, terminalTabs, allFiles, queueItems, query])

  const filtered = useMemo(() => {
    const q = query.trim()
    const pool = mode === 'files' ? items.filter((i) => i.group === 'Open file') : items

    if (!q) {
      if (mode === 'files') {
        const recentSet = new Set(recentFilePaths)
        const recents = recentFilePaths
          .map((p) => pool.find((i) => i.id === `file:${p}`))
          .filter((i): i is PaletteItem => !!i)
          .map((i) => ({ ...i, group: 'Recent files' }))
        const others = pool.filter((i) => !recentSet.has(i.id.replace(/^file:/, ''))).slice(0, 50)
        return [...recents, ...others]
      }
      return pool.filter((i) => i.group !== 'Open file').slice(0, 50)
    }

    const enqueueItem = mode === 'all' ? pool.find((i) => i.id === 'action:enqueue') : undefined
    const looksLikePrompt = mode === 'all' && (q.length >= 4 || q.includes(' '))

    const scored: { item: PaletteItem; score: number }[] = []
    for (const item of pool) {
      if (item.id === 'action:enqueue') continue
      const labelMatch = fuzzyMatch(q, item.label)
      const hintMatch = item.hint ? fuzzyMatch(q, item.hint) : { score: 0, matched: false }
      if (!labelMatch.matched && !hintMatch.matched) continue
      const score = Math.max(labelMatch.score, hintMatch.score * 0.6)
      scored.push({ item, score })
    }
    scored.sort((a, b) => b.score - a.score)

    let result: PaletteItem[]
    const fileCount = scored.filter((s) => s.item.group === 'Open file').length
    if (fileCount > MAX_FILE_RESULTS) {
      let kept = 0
      result = scored
        .filter((s) => {
          if (s.item.group !== 'Open file') return true
          if (kept >= MAX_FILE_RESULTS) return false
          kept++
          return true
        })
        .map((s) => s.item)
    } else {
      result = scored.map((s) => s.item)
    }

    if (enqueueItem && looksLikePrompt) {
      return [enqueueItem, ...result]
    }
    if (enqueueItem) {
      result.push(enqueueItem)
    }
    return result
  }, [items, query, mode, recentFilePaths])

  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0)
  }, [filtered.length, selectedIdx])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const runSelected = useCallback(() => {
    const item = filtered[selectedIdx]
    if (!item) return
    item.run()
    close()
  }, [filtered, selectedIdx, close])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runSelected()
      }
    },
    [filtered.length, runSelected, close]
  )

  if (!open) return null

  let lastGroup = ''
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/60 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
        className="w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={filtered.length > 0}
          aria-controls="command-palette-list"
          aria-activedescendant={filtered.length > 0 ? `command-palette-item-${selectedIdx}` : undefined}
          aria-autocomplete="list"
          aria-label="Search commands, files and projects"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedIdx(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'files' ? 'Search files...' : `Type a prompt for ${paletteLlmLabel}, or search commands / files / projects...`}
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          <div aria-live="polite" className="sr-only">
            {filtered.length === 0 ? 'No matches' : `${filtered.length} results`}
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">No matches</div>
          )}
          {filtered.map((item, idx) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-zinc-500">
                    {item.group}
                  </div>
                )}
                <div
                  data-idx={idx}
                  id={`command-palette-item-${idx}`}
                  role="option"
                  aria-selected={selectedIdx === idx}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    item.run()
                    close()
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-4 py-2 text-xs',
                    selectedIdx === idx ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'
                  )}
                >
                  <span className="text-zinc-500">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="ml-auto truncate text-micro text-zinc-500">{item.hint}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-1.5 text-micro text-zinc-500">
          <span>↑↓ navigate · ↵ run · esc close</span>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
