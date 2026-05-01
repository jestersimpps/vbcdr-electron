import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useThemeStore } from '@/stores/theme-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useProjectStore } from '@/stores/project-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import { playSound } from '@/lib/sound'

interface TerminalInstanceProps {
  tabId: string
  projectId: string
  cwd: string
  initialCommand?: string
}

interface TerminalEntry {
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  onIncomingData?: (data: string) => void
  suppressBusyUntil: number
}

const terminalsMap = new Map<string, TerminalEntry>()
const bufferReadTimers = new Map<string, ReturnType<typeof setTimeout>>()

const ACTIVITY_DEBOUNCE_MS = 1000
const activityLastSent = new Map<string, number>()

function recordActivityDebounced(projectId: string, kind: 'i' | 'o'): void {
  if (!projectId) return
  const key = `${projectId}:${kind}`
  const now = Date.now()
  const last = activityLastSent.get(key) ?? 0
  if (now - last < ACTIVITY_DEBOUNCE_MS) return
  activityLastSent.set(key, now)
  window.api.activity.record(projectId, kind)
}

let globalDataUnsub: (() => void) | null = null

function ensureGlobalDataDispatcher(): void {
  if (globalDataUnsub) return
  globalDataUnsub = window.api.terminal.onData((incomingTabId: string, data: string) => {
    terminalsMap.get(incomingTabId)?.onIncomingData?.(data)
  })
}


export function applyThemeToAll(themeId: string): void {
  const xtermTheme = getTerminalTheme(themeId)
  const transparent = !!useLayoutStore.getState().backgroundImage
  const themeToApply = transparent ? { ...xtermTheme, background: '#00000000' } : xtermTheme
  terminalsMap.forEach(({ terminal }) => {
    terminal.options.theme = themeToApply
  })
}

export function applyBackgroundTransparency(transparent: boolean): void {
  terminalsMap.forEach(({ terminal }) => {
    const current = terminal.options.theme ?? {}
    const themeId = useThemeStore.getState().getTerminalThemeId()
    const base = getTerminalTheme(themeId)
    terminal.options.theme = transparent
      ? { ...base, ...current, background: '#00000000' }
      : { ...base, ...current, background: base.background }
  })
}

function shellEscape(path: string): string {
  if (/[^a-zA-Z0-9_./:@~=-]/.test(path)) {
    return "'" + path.replace(/'/g, "'\\''") + "'"
  }
  return path
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

const ANSI_RE = /\x1b(?:\[[0-9;?]*[a-zA-Z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|\([ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz])/g
const TOKEN_RE = /(\d[\d,.]*)\s*tokens?/

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}

function parseTokenCount(line: string): number | null {
  const m = TOKEN_RE.exec(line)
  if (!m) return null
  return parseInt(m[1].replace(/[,.]/g, ''), 10)
}

export function TerminalInstance({ tabId, projectId, cwd, initialCommand }: TerminalInstanceProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let entry = terminalsMap.get(tabId)

    if (entry) {
      const xtermEl = entry.terminal.element
      if (xtermEl && xtermEl.parentElement !== el) {
        try { entry.terminal.open(el) } catch { /* re-open may throw if element was disposed */ }
        try { entry.fitAddon.fit() } catch { /* container may not be sized yet */ }
        try { entry.terminal.refresh(0, entry.terminal.rows - 1) } catch { /* disposed */ }
      }
    }

    if (!entry) {
      const transparent = !!useLayoutStore.getState().backgroundImage
      const baseTheme = getTerminalTheme(useThemeStore.getState().getTerminalThemeId())
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Courier New, monospace',
        cols: 80,
        rows: 24,
        allowProposedApi: true,
        allowTransparency: transparent,
        theme: transparent ? { ...baseTheme, background: '#00000000' } : baseTheme
      })

      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()
      const unicode11Addon = new Unicode11Addon()
      const webLinksAddon = new WebLinksAddon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)
      terminal.loadAddon(unicode11Addon)
      terminal.loadAddon(webLinksAddon)

      terminal.unicode.activeVersion = '11'

      entry = { terminal, fitAddon, searchAddon, suppressBusyUntil: 0 }
      terminalsMap.set(tabId, entry)

      terminal.attachCustomKeyEventHandler((e) => {
        if (e.key === 'Enter' && e.shiftKey && (e.type === 'keydown' || e.type === 'keypress')) {
          if (e.type === 'keydown') {
            window.api.terminal.write(tabId, '\x1b[13;2u')
          }
          return false
        }
        return true
      })

      const isLlm = !!initialCommand
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      let busyPromoteTimer: ReturnType<typeof setTimeout> | null = null
      let lastOutputAt = 0
      const BUSY_SUSTAIN_MS = 3000
      const STREAK_GAP_MS = 500

      terminal.onData((data) => {
        window.api.terminal.write(tabId, data)
        recordActivityDebounced(projectId, 'i')
        if (isLlm) {
          const e = terminalsMap.get(tabId)
          if (e) e.suppressBusyUntil = Date.now() + 300
        }
      })

      terminal.onResize(({ cols, rows }) => {
        window.api.terminal.resize(tabId, cols, rows)
      })

      terminal.onTitleChange((title) => {
        useTerminalStore.getState().setTabTitle(tabId, title)
      })


      const onIncomingData = (data: string): void => {
        recordActivityDebounced(projectId, 'o')
        try {
          const buf = terminal.buffer.active
          const atBottom = buf.baseY - buf.viewportY <= 1
          terminal.write(data, () => {
            if (atBottom) terminal.scrollToBottom()
          })
        } catch {
          return
        }

        if (isLlm) {
          const entry = terminalsMap.get(tabId)
          const suppressed = !!(entry && Date.now() < entry.suppressBusyUntil)
          if (!suppressed) {
            const now = Date.now()
            if (now - lastOutputAt > STREAK_GAP_MS) {
              if (busyPromoteTimer) clearTimeout(busyPromoteTimer)
              busyPromoteTimer = setTimeout(() => {
                const s = useTerminalStore.getState().tabStatuses[tabId]
                if (s !== 'busy') useTerminalStore.getState().setTabStatus(tabId, 'busy')
              }, BUSY_SUSTAIN_MS)
            }
            lastOutputAt = now

            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              if (busyPromoteTimer) { clearTimeout(busyPromoteTimer); busyPromoteTimer = null }
              const prev = useTerminalStore.getState().tabStatuses[tabId]
              useTerminalStore.getState().setTabStatus(tabId, 'idle')
              if (prev !== 'idle' && useProjectStore.getState().activeProjectId !== projectId) {
                useTerminalStore.getState().markProjectAttention(projectId)
              }
              if (prev === 'busy') {
                const { idleSoundEnabled, idleSoundId } = useLayoutStore.getState()
                if (idleSoundEnabled) playSound(idleSoundId)
              }
            }, 3000)
          }

          const prevTimer = bufferReadTimers.get(tabId)
          if (prevTimer) clearTimeout(prevTimer)
          bufferReadTimers.set(tabId, setTimeout(() => {
            bufferReadTimers.delete(tabId)
            const te = terminalsMap.get(tabId)
            if (!te) return
            const buf = te.terminal.buffer.active
            const extracted: string[] = []
            let latestTokens: number | null = null
            for (let y = 0; y < te.terminal.rows; y++) {
              const row = buf.getLine(buf.baseY + y)
              if (row) {
                const text = row.translateToString(true)
                if (text.trim()) extracted.push(text)
                const tokens = parseTokenCount(stripAnsi(text))
                if (tokens !== null) latestTokens = tokens
              }
            }
            if (extracted.length > 0) {
              useTerminalStore.getState().setOutput(projectId, extracted)
            }
            if (latestTokens !== null) {
              useTerminalStore.getState().setTokenUsage(tabId, latestTokens)
              window.api.tokenUsage.record(tabId, projectId, latestTokens)
            }
          }, 200))
        }
      }
      terminalsMap.get(tabId)!.onIncomingData = onIncomingData
      ensureGlobalDataDispatcher()

      let opened = false
      const openWhenSized = (): void => {
        if (opened) return
        if (el.clientWidth === 0 || el.clientHeight === 0) return
        opened = true
        sizeObserver.disconnect()

        terminal.open(el)

        const textarea = terminal.textarea
        if (textarea) {
          textarea.addEventListener('focus', () => {
            useTerminalStore.getState().setFocusedTabId(tabId)
          })
          textarea.addEventListener('blur', () => {
            if (useTerminalStore.getState().focusedTabId === tabId) {
              useTerminalStore.getState().setFocusedTabId(null)
            }
          })
        }

        if (!transparent) {
          let webglRetry = 0
          const loadWebgl = (): void => {
            try {
              const webgl = new WebglAddon()
              webgl.onContextLoss(() => {
                try { webgl.dispose() } catch { /* context already gone */ }
                try { terminal.refresh(0, terminal.rows - 1) } catch { /* disposed */ }
                if (webglRetry++ < 2) setTimeout(loadWebgl, 1000)
              })
              terminal.loadAddon(webgl)
            } catch {
              try { terminal.refresh(0, terminal.rows - 1) } catch { /* disposed */ }
            }
          }
          loadWebgl()
        }

        fitAddon.fit()
        terminal.scrollToBottom()
        terminal.focus()
        window.api.terminal.create(tabId, projectId, cwd, terminal.cols, terminal.rows)
        if (initialCommand) {
          setTimeout(() => {
            window.api.terminal.write(tabId, initialCommand + '\n')
          }, 500)
        }
      }

      const sizeObserver = new ResizeObserver(openWhenSized)
      sizeObserver.observe(el)
      openWhenSized()
    }

    const { terminal, fitAddon } = entry
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    let prevCols = terminal.cols
    let prevRows = terminal.rows
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          if (!el.contains(terminal.element)) return
          const buf = terminal.buffer.active
          const atBottom = buf.baseY - buf.viewportY <= 1
          fitAddon.fit()
          if (terminal.cols === prevCols && terminal.rows === prevRows) return
          prevCols = terminal.cols
          prevRows = terminal.rows
          const e = terminalsMap.get(tabId)
          if (e) e.suppressBusyUntil = Date.now() + 1000
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

      const imagePaths: string[] = []
      const otherPaths: string[] = []

      for (let i = 0; i < files.length; i++) {
        const filePath = window.api.getPathForFile(files[i])
        if (!filePath) continue
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
        if (IMAGE_EXTENSIONS.has(ext)) {
          imagePaths.push(filePath)
        } else {
          otherPaths.push(shellEscape(filePath))
        }
      }

      for (const imgPath of imagePaths) {
        window.api.terminal.pasteImage(tabId, imgPath)
      }

      if (otherPaths.length > 0) {
        terminalsMap.get(tabId)?.terminal.paste(otherPaths.join(' '))
      }
    }

    const onPaste = (e: ClipboardEvent): void => {
      const hasImage = e.clipboardData?.types.some((t) => t.startsWith('image/'))
      const hasText = e.clipboardData?.types.includes('text/plain')
      if (hasImage && !hasText) {
        e.preventDefault()
        e.stopPropagation()
        window.api.terminal.pasteClipboardImage(tabId)
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    el.addEventListener('paste', onPaste, true)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      observer.disconnect()
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      el.removeEventListener('paste', onPaste, true)
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

export function getTerminalInstance(tabId: string): TerminalEntry | undefined {
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
  entry.suppressBusyUntil = Date.now() + 500
  const applyFit = (): void => {
    try {
      entry.fitAddon.fit()
      if (entry.terminal.cols < 2 || entry.terminal.rows < 2) {
        requestAnimationFrame(applyFit)
        return
      }
      window.api.terminal.resize(tabId, entry.terminal.cols, entry.terminal.rows)
      entry.terminal.refresh(0, entry.terminal.rows - 1)
      entry.terminal.scrollToBottom()
      entry.terminal.focus()
    } catch { /* terminal may be disposed or not yet open */ }
  }
  applyFit()
}

export function disposeTerminal(tabId: string): void {
  const entry = terminalsMap.get(tabId)
  if (entry) {
    entry.onIncomingData = undefined
    const timer = bufferReadTimers.get(tabId)
    if (timer) clearTimeout(timer)
    bufferReadTimers.delete(tabId)
    try { entry.terminal.dispose() } catch { /* WebGL addon may throw during dispose */ }
    terminalsMap.delete(tabId)
  }
  window.api.tokenUsage.resetTab(tabId)
}
