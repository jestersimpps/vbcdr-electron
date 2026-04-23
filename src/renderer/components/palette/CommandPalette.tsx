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
  LayoutGrid,
  ArrowRight
} from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useEditorStore } from '@/stores/editor-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useQueueStore } from '@/stores/queue-store'
import { useLayoutStore } from '@/stores/layout-store'
import { sendToTerminal } from '@/lib/send-to-terminal'
import type { FileNode } from '@/models/types'
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

function flattenTree(node: FileNode | undefined, out: { path: string; name: string }[] = []): { path: string; name: string }[] {
  if (!node) return out
  if (!node.isDirectory) out.push({ path: node.path, name: node.name })
  if (node.children) {
    for (const child of node.children) flattenTree(child, out)
  }
  return out
}

function fuzzyMatch(query: string, target: string): { score: number; matched: boolean } {
  if (!query) return { score: 0, matched: true }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) {
    const idx = t.indexOf(q)
    return { score: 1000 - idx - (target.length - query.length) * 0.1, matched: true }
  }
  let qi = 0
  let score = 0
  let lastMatch = -2
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += i - lastMatch === 1 ? 5 : 1
      lastMatch = i
      qi++
    }
  }
  return qi === q.length ? { score, matched: true } : { score: 0, matched: false }
}

type PaletteMode = 'all' | 'files'

export function CommandPalette(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PaletteMode>('all')
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => {
          if (prev && mode === 'all') return false
          setMode('all')
          return true
        })
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        setOpen((prev) => {
          if (prev && mode === 'files') return false
          setMode('files')
          return true
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, mode])

  const close = useCallback(() => setOpen(false), [])

  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const terminalTabs = useTerminalStore((s) => s.tabs)
  const queueItems = useQueueStore((s) => (activeProjectId ? s.itemsPerProject[activeProjectId] ?? [] : []))
  const fileTree = useFileTreeStore((s) => (activeProjectId ? s.treePerProject[activeProjectId] : undefined))
  const openFiles = useEditorStore((s) => (activeProjectId ? s.statePerProject[activeProjectId]?.openFiles ?? [] : []))

  const allFiles = useMemo(() => flattenTree(fileTree), [fileTree])
  const recentFilePaths = useMemo(() => [...openFiles].reverse().map((f) => f.path), [openFiles])

  const items = useMemo<PaletteItem[]>(() => {
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
            const activeTabId = useTerminalStore.getState().activeTabPerProject[activeProjectId]
            if (!activeTabId) return
            useQueueStore.getState().removeItem(activeProjectId, q.id)
            sendToTerminal(activeTabId, q.text)
          }
        })
      }

      list.push({
        id: 'action:toggle-browserless',
        label: 'Toggle browserless layout',
        group: 'Actions',
        icon: <LayoutGrid size={14} />,
        run: () => useLayoutStore.getState().toggleBrowserless(activeProjectId)
      })
    }

    list.push(
      {
        id: 'nav:dashboard',
        label: 'Dashboard',
        group: 'Go to',
        icon: <ArrowRight size={14} />,
        run: () => useProjectStore.getState().showDashboard()
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
  }, [projects, activeProjectId, terminalTabs, allFiles, queueItems])

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

    const scored: { item: PaletteItem; score: number }[] = []
    for (const item of pool) {
      const labelMatch = fuzzyMatch(q, item.label)
      const hintMatch = item.hint ? fuzzyMatch(q, item.hint) : { score: 0, matched: false }
      if (!labelMatch.matched && !hintMatch.matched) continue
      const score = Math.max(labelMatch.score, hintMatch.score * 0.6)
      scored.push({ item, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const fileCount = scored.filter((s) => s.item.group === 'Open file').length
    if (fileCount > MAX_FILE_RESULTS) {
      let kept = 0
      return scored
        .filter((s) => {
          if (s.item.group !== 'Open file') return true
          if (kept >= MAX_FILE_RESULTS) return false
          kept++
          return true
        })
        .map((s) => s.item)
    }
    return scored.map((s) => s.item)
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
      <div className="w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedIdx(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'files' ? 'Search files...' : 'Type a command, project, file, or queued prompt...'}
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">No matches</div>
          )}
          {filtered.map((item, idx) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {item.group}
                  </div>
                )}
                <div
                  data-idx={idx}
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
                    <span className="ml-auto truncate text-[10px] text-zinc-500">{item.hint}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
          <span>↑↓ navigate · ↵ run · esc close</span>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
