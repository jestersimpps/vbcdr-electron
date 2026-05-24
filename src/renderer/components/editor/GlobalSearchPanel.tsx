import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, FileText, X } from 'lucide-react'
import { loader } from '@monaco-editor/react'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useThemeStore } from '@/stores/theme-store'
import { useSearchPrefsStore, DEFAULT_EXCLUDES } from '@/stores/search-prefs-store'
import { MONACO_THEME_NAME } from '@/config/monaco-theme-registry'
import type { SearchResult } from '@/models/types'
import { cn } from '@/lib/utils'

interface GroupedResults {
  path: string
  name: string
  relativePath: string
  matches: { line: number; lineContent: string }[]
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  xml: 'xml',
  svg: 'xml',
  toml: 'ini',
  env: 'ini',
  graphql: 'graphql'
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

function groupByFile(results: SearchResult[]): GroupedResults[] {
  const map = new Map<string, GroupedResults>()
  for (const r of results) {
    if (r.type !== 'content' || r.line === undefined) continue
    const existing = map.get(r.path)
    if (existing) {
      existing.matches.push({ line: r.line, lineContent: r.lineContent ?? '' })
    } else {
      map.set(r.path, {
        path: r.path,
        name: r.name,
        relativePath: r.relativePath,
        matches: [{ line: r.line, lineContent: r.lineContent ?? '' }]
      })
    }
  }
  return Array.from(map.values())
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wrapMatchInHtml(html: string, query: string): string {
  if (!query) return html
  const re = new RegExp(escapeRegExp(escapeHtml(query)), 'gi')
  let out = ''
  let buffer = ''
  let i = 0
  while (i < html.length) {
    const ch = html[i]
    if (ch === '<') {
      if (buffer) {
        out += buffer.replace(re, (m) => `<mark class="gs-hit">${m}</mark>`)
        buffer = ''
      }
      const end = html.indexOf('>', i)
      if (end === -1) {
        out += html.slice(i)
        break
      }
      out += html.slice(i, end + 1)
      i = end + 1
      continue
    }
    buffer += ch
    i++
  }
  if (buffer) {
    out += buffer.replace(re, (m) => `<mark class="gs-hit">${m}</mark>`)
  }
  return out
}

interface MonacoLike {
  editor: {
    colorize: (text: string, language: string, options: { tabSize: number }) => Promise<string>
    setTheme: (themeName: string) => void
  }
}

export function GlobalSearchPanel(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [colorized, setColorized] = useState<Record<string, string>>({})
  const [excludeDraft, setExcludeDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monacoRef = useRef<MonacoLike | null>(null)

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )

  const excludesPerProject = useSearchPrefsStore((s) => s.excludesPerProject)
  const setExcludesAction = useSearchPrefsStore((s) => s.setExcludes)
  const excludes = useMemo(() => {
    if (!activeProjectId) return DEFAULT_EXCLUDES
    return excludesPerProject[activeProjectId] ?? DEFAULT_EXCLUDES
  }, [excludesPerProject, activeProjectId])

  const getFullThemeId = useThemeStore((s) => s.getFullThemeId)
  const themeId = getFullThemeId()
  const monacoThemeName = MONACO_THEME_NAME[themeId] ?? 'github-dark'

  const openFile = useEditorStore((s) => s.openFile)
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const setPendingRevealLine = useEditorStore((s) => s.setPendingRevealLine)

  useEffect(() => {
    let cancelled = false
    loader.init().then((m) => {
      if (!cancelled) monacoRef.current = m as unknown as MonacoLike
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        if (!activeProjectId) return
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeProjectId])

  useEffect(() => {
    if (open) {
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim() || !activeProject) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await window.api.fs.search(activeProject.path, query.trim(), excludes)
        setResults(res as SearchResult[])
      } catch {
        setResults([])
      }
      setSearching(false)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, excludes, activeProject])

  const addExclude = useCallback((raw: string): void => {
    if (!activeProjectId) return
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) return
    setExcludesAction(activeProjectId, [...excludes, ...parts])
    setExcludeDraft('')
  }, [activeProjectId, excludes, setExcludesAction])

  const removeExclude = useCallback((value: string): void => {
    if (!activeProjectId) return
    setExcludesAction(activeProjectId, excludes.filter((e) => e !== value))
  }, [activeProjectId, excludes, setExcludesAction])

  const grouped = useMemo(() => groupByFile(results), [results])

  const flatHits = useMemo(() => {
    const flat: { groupIdx: number; matchIdx: number; group: GroupedResults; line: number; lineContent: string; key: string }[] = []
    grouped.forEach((g, gi) => {
      g.matches.forEach((m, mi) => {
        flat.push({
          groupIdx: gi,
          matchIdx: mi,
          group: g,
          line: m.line,
          lineContent: m.lineContent,
          key: `${g.path}:${m.line}:${mi}`
        })
      })
    })
    return flat
  }, [grouped])

  useEffect(() => {
    if (selectedIdx >= flatHits.length) setSelectedIdx(0)
  }, [flatHits.length, selectedIdx])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    try {
      monaco.editor.setTheme(monacoThemeName)
    } catch {
      // ignore — theme may not be registered yet
    }
    let cancelled = false
    const work = async (): Promise<void> => {
      const next: Record<string, string> = {}
      const tasks = flatHits.slice(0, 200).map(async (h) => {
        try {
          const lang = detectLanguage(h.group.name)
          const html = await monaco.editor.colorize(h.lineContent, lang, { tabSize: 2 })
          next[h.key] = wrapMatchInHtml(html, query)
        } catch {
          next[h.key] = wrapMatchInHtml(escapeHtml(h.lineContent), query)
        }
      })
      await Promise.all(tasks)
      if (!cancelled) setColorized(next)
    }
    void work()
    return () => { cancelled = true }
  }, [flatHits, query, monacoThemeName])

  const openHit = useCallback((hit: typeof flatHits[number]) => {
    if (!activeProjectId || !activeProject) return
    setPendingRevealLine(hit.group.path, hit.line)
    void openFile(activeProjectId, hit.group.path, hit.group.name, activeProject.path)
    setCenterTab(activeProjectId, 'editor')
    close()
  }, [activeProjectId, activeProject, openFile, setCenterTab, setPendingRevealLine, close])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, flatHits.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const hit = flatHits[selectedIdx]
        if (hit) openHit(hit)
      }
    },
    [flatHits, selectedIdx, openHit, close]
  )

  if (!open) return null

  const fileCount = grouped.length
  const hitCount = flatHits.length

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/60 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <style>{`
        .gs-hit { background: rgba(245, 158, 11, 0.35); color: #fde68a; border-radius: 2px; padding: 0 1px; }
        .gs-line .monaco-tokenized-source { font-size: 11px !important; line-height: 16px !important; }
        .gs-line span { font-size: 11px !important; line-height: 16px !important; }
      `}</style>
      <div className="w-[720px] max-w-[92vw] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <Search size={12} className="shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIdx(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search across all files in project..."
            className="flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Clear"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 px-3 py-1.5">
          <span className="mr-1 text-micro uppercase tracking-wider text-zinc-500">Exclude</span>
          {excludes.map((ex) => (
            <span
              key={ex}
              className="group inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-300"
            >
              <span className="font-mono">{ex}</span>
              <button
                onClick={() => removeExclude(ex)}
                className="text-zinc-500 hover:text-zinc-200"
                title={`Remove ${ex}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={excludeDraft}
            onChange={(e) => setExcludeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addExclude(excludeDraft)
              } else if (e.key === 'Backspace' && !excludeDraft && excludes.length > 0) {
                e.preventDefault()
                removeExclude(excludes[excludes.length - 1])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
            onBlur={() => excludeDraft && addExclude(excludeDraft)}
            placeholder="add folder…"
            className="min-w-[80px] flex-1 bg-transparent text-micro text-zinc-300 outline-none placeholder:text-zinc-600"
            spellCheck={false}
          />
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {searching && (
            <div className="px-4 py-6 text-center text-micro text-zinc-500">Searching…</div>
          )}
          {!searching && !query && (
            <div className="px-4 py-6 text-center text-micro text-zinc-500">
              Type to search file contents across the project
            </div>
          )}
          {!searching && query && grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-micro text-zinc-500">No matches</div>
          )}
          {grouped.map((g) => (
            <div key={g.path}>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800/60 bg-zinc-900 px-3 py-1 text-micro">
                <FileText size={10} className="shrink-0 text-zinc-500" />
                <span className="truncate font-medium text-zinc-300">{g.name}</span>
                <span className="truncate text-zinc-600">{g.relativePath}</span>
                <span className="ml-auto shrink-0 tabular-nums text-zinc-500">
                  {g.matches.length}
                </span>
              </div>
              {g.matches.map((m, mi) => {
                const hitKey = `${g.path}:${m.line}:${mi}`
                const idx = flatHits.findIndex((h) => h.key === hitKey)
                const html = colorized[hitKey]
                return (
                  <div
                    key={hitKey}
                    data-idx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      const hit = flatHits[idx]
                      if (hit) openHit(hit)
                    }}
                    className={cn(
                      'flex cursor-pointer items-baseline gap-3 px-4 py-0.5',
                      selectedIdx === idx ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                    )}
                    style={{ fontSize: '11px', lineHeight: '16px' }}
                  >
                    <span
                      className="shrink-0 tabular-nums text-zinc-600"
                      style={{ fontSize: '10px', minWidth: '2.5ch', textAlign: 'right' }}
                    >
                      {m.line}
                    </span>
                    {html ? (
                      <span
                        className="gs-line truncate font-mono"
                        style={{ fontSize: '11px', lineHeight: '16px' }}
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    ) : (
                      <span
                        className="truncate font-mono text-zinc-400"
                        style={{ fontSize: '11px', lineHeight: '16px' }}
                        dangerouslySetInnerHTML={{ __html: wrapMatchInHtml(escapeHtml(m.lineContent), query) }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-1 text-micro text-zinc-500">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>
            {hitCount} {hitCount === 1 ? 'hit' : 'hits'} in {fileCount}{' '}
            {fileCount === 1 ? 'file' : 'files'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
