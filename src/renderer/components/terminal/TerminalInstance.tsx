import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useThemeStore } from '@/stores/theme-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'

interface TerminalInstanceProps {
  tabId: string
  projectId: string
  cwd: string
  initialCommand?: string
}

const terminalsMap = new Map<string, { terminal: Terminal; fitAddon: FitAddon; searchAddon: SearchAddon; unsubData?: () => void }>()

export function applyThemeToAll(themeId: string): void {
  const xtermTheme = getTerminalTheme(themeId)
  terminalsMap.forEach(({ terminal }) => {
    terminal.options.theme = xtermTheme
  })
}

function shellEscape(path: string): string {
  if (/[^a-zA-Z0-9_./:@~=-]/.test(path)) {
    return "'" + path.replace(/'/g, "'\\''") + "'"
  }
  return path
}

export function TerminalInstance({ tabId, projectId, cwd, initialCommand }: TerminalInstanceProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let entry = terminalsMap.get(tabId)

    if (!entry) {
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Courier New, monospace',
        cols: 80,
        rows: 24,
        allowProposedApi: true,
        theme: getTerminalTheme(useThemeStore.getState().getFullThemeId())
      })

      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()
      const unicode11Addon = new Unicode11Addon()
      const webLinksAddon = new WebLinksAddon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)
      terminal.loadAddon(unicode11Addon)
      terminal.loadAddon(webLinksAddon)

      terminal.open(el)

      terminal.unicode.activeVersion = '11'

      try {
        terminal.loadAddon(new WebglAddon())
      } catch {
        /* WebGL not available, fall back to canvas renderer */
      }

      entry = { terminal, fitAddon, searchAddon }
      terminalsMap.set(tabId, entry)

      terminal.onData((data) => {
        window.api.terminal.write(tabId, data)
      })

      terminal.onResize(({ cols, rows }) => {
        window.api.terminal.resize(tabId, cols, rows)
      })

      const unsubData = window.api.terminal.onData((incomingTabId: string, data: string) => {
        if (incomingTabId === tabId) {
          const buf = terminal.buffer.active
          const atBottom = buf.baseY - buf.viewportY <= 1
          terminal.write(data, () => {
            if (atBottom) terminal.scrollToBottom()
          })
        }
      })
      terminalsMap.get(tabId)!.unsubData = unsubData

      setTimeout(() => {
        fitAddon.fit()
        terminal.scrollToBottom()
        terminal.focus()
        window.api.terminal.create(tabId, projectId, cwd, terminal.cols, terminal.rows)
        if (initialCommand) {
          setTimeout(() => {
            window.api.terminal.write(tabId, initialCommand + '\n')
          }, 500)
        }
      }, 200)
    }

    const { terminal, fitAddon } = entry
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          const atBottom = terminal.buffer.active.viewportY === terminal.buffer.active.baseY
          fitAddon.fit()
          if (atBottom) terminal.scrollToBottom()
        } catch { /* element may be unmounted during resize */ }
      }, 80)
    })
    observer.observe(el)

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragOver(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) {
        setIsDragOver(false)
      }
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragOver(false)

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const paths: string[] = []
      for (let i = 0; i < files.length; i++) {
        const filePath = (files[i] as File & { path: string }).path
        if (filePath) {
          paths.push(shellEscape(filePath))
        }
      }

      if (paths.length > 0) {
        const mapEntry = terminalsMap.get(tabId)
        if (mapEntry) {
          mapEntry.terminal.paste(paths.join(' '))
        }
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      observer.disconnect()
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [tabId, projectId, cwd, initialCommand])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        outline: isDragOver ? '2px solid rgba(96, 165, 250, 0.7)' : 'none',
        outlineOffset: '-2px',
        backgroundColor: isDragOver ? 'rgba(96, 165, 250, 0.05)' : undefined,
        transition: 'outline 150ms ease, background-color 150ms ease'
      }}
    />
  )
}

export function getTerminalInstance(
  tabId: string
): { terminal: Terminal; fitAddon: FitAddon; searchAddon: SearchAddon; unsubData?: () => void } | undefined {
  return terminalsMap.get(tabId)
}

const SEARCH_DECORATIONS = {
  matchBackground: '#3b82f680',
  matchBorder: '#3b82f6',
  matchOverviewRuler: '#3b82f6',
  activeMatchBackground: '#f59e0b',
  activeMatchBorder: '#f59e0b',
  activeMatchColorOverviewRuler: '#f59e0b'
}

export function searchTerminal(tabId: string, query: string, direction: 'next' | 'previous' = 'next'): boolean {
  const entry = terminalsMap.get(tabId)
  if (!entry) return false
  const opts = { decorations: SEARCH_DECORATIONS }
  return direction === 'next'
    ? entry.searchAddon.findNext(query, opts)
    : entry.searchAddon.findPrevious(query, opts)
}

export function clearTerminalSearch(tabId: string): void {
  const entry = terminalsMap.get(tabId)
  if (entry) entry.searchAddon.clearDecorations()
}

export function focusTerminal(tabId: string): void {
  const entry = terminalsMap.get(tabId)
  if (!entry) return
  entry.fitAddon.fit()
  entry.terminal.scrollToBottom()
  entry.terminal.focus()
}

export function disposeTerminal(tabId: string): void {
  const entry = terminalsMap.get(tabId)
  if (entry) {
    entry.unsubData?.()
    try { entry.terminal.dispose() } catch { /* WebGL addon may throw during dispose */ }
    terminalsMap.delete(tabId)
  }
}
