import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useThemeStore } from '@/stores/theme-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import { playSound } from '@/lib/sound'
import { findFileMatches } from '@/lib/terminal-output-tidy'
import { isMeaningfulOutput, parseTokenCount, stripAnsi } from '@/lib/terminal-text'
import { IMAGE_EXTENSIONS, relativeToCwd, resolveAgainstCwd, shellEscape } from '@/lib/terminal-paths'
import { ImageThumbnail } from '@/components/terminal/ImageThumbnail'

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
  projectId: string
  textareaListeners?: { textarea: HTMLTextAreaElement; onFocus: () => void; onBlur: () => void }
  idleTimer?: ReturnType<typeof setTimeout> | null
  busyPromoteTimer?: ReturnType<typeof setTimeout> | null
  bufferReadTimer?: ReturnType<typeof setTimeout> | null
  lastBufferSig?: string
}

const terminalsMap = new Map<string, TerminalEntry>()

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
  terminalsMap.forEach(({ terminal }) => {
    terminal.options.theme = xtermTheme
  })
}

async function openPathFromTerminal(
  projectId: string,
  cwd: string,
  rawPath: string,
  line: number | null
): Promise<void> {
  const absolute = resolveAgainstCwd(rawPath, cwd)
  const name = rawPath.split(/[\\/]/).pop() ?? rawPath
  const editor = useEditorStore.getState()
  if (line !== null) editor.setPendingRevealLine(absolute, line)
  try {
    await editor.openFile(projectId, absolute, name, cwd)
  } catch {
    /* file may not exist or be readable; silently ignore */
  }
}

export function TerminalInstance({ tabId, projectId, cwd, initialCommand }: TerminalInstanceProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [thumbSrc, setThumbSrc] = useState<string | null>(null)
  const dragCounter = useRef(0)
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showImageThumbnailRef = useRef<(absolutePath: string) => void>(() => undefined)
  const dismissThumbnailRef = useRef<() => void>(() => undefined)
  showImageThumbnailRef.current = async (absolutePath: string) => {
    const dataUrl = await window.api.fs.readImageAsDataUrl(absolutePath)
    if (!dataUrl) return
    if (thumbTimerRef.current) { clearTimeout(thumbTimerRef.current); thumbTimerRef.current = null }
    setThumbSrc(dataUrl)
  }
  dismissThumbnailRef.current = () => {
    if (thumbTimerRef.current) { clearTimeout(thumbTimerRef.current); thumbTimerRef.current = null }
    setThumbSrc(null)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let entry = terminalsMap.get(tabId)

    if (entry) {
      const xtermEl = entry.terminal.element
      if (xtermEl && xtermEl.parentElement !== el) {
        try { el.appendChild(xtermEl) } catch { /* element may have been removed */ }
        const reattachFit = (): void => {
          try {
            if (el.clientWidth === 0 || el.clientHeight === 0) return
            entry!.fitAddon.fit()
          } catch { /* disposed */ }
        }
        reattachFit()
        requestAnimationFrame(reattachFit)
        setTimeout(reattachFit, 100)
        try { entry.terminal.refresh(0, entry.terminal.rows - 1) } catch { /* disposed */ }
      } else if (!xtermEl) {
        try { entry.terminal.dispose() } catch { /* not yet open */ }
        terminalsMap.delete(tabId)
        entry = undefined
      }
    }

    if (!entry) {
      const baseTheme = getTerminalTheme(useThemeStore.getState().getTerminalThemeId())
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Courier New, monospace',
        cols: 80,
        rows: 24,
        scrollback: 2000,
        allowProposedApi: true,
        theme: baseTheme
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

      entry = { terminal, fitAddon, searchAddon, suppressBusyUntil: 0, projectId }
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
      let lastOutputAt = 0
      const BUSY_SUSTAIN_MS = 3000
      const STREAK_GAP_MS = 500
      const BUFFER_SCAN_DEBOUNCE_MS = 400

      terminal.onData((data) => {
        window.api.terminal.write(tabId, data)
        recordActivityDebounced(projectId, 'i')
        if (data.includes('\r') || data.includes('\n')) {
          dismissThumbnailRef.current()
        }
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
        if (isMeaningfulOutput(data)) recordActivityDebounced(projectId, 'o')
        try {
          const buf = terminal.buffer.active
          const atBottom = buf.baseY - buf.viewportY <= 1
          const hidden = el.offsetParent === null
          const autoScroll = useTerminalStore.getState().isAutoScroll(tabId)
          terminal.write(data, () => {
            if (autoScroll && (atBottom || hidden)) terminal.scrollToBottom()
          })
        } catch {
          return
        }

        const entry = terminalsMap.get(tabId)
        if (!entry) return
        const suppressed = Date.now() < entry.suppressBusyUntil
        if (!suppressed) {
          const now = Date.now()
          if (now - lastOutputAt > STREAK_GAP_MS) {
            if (entry.busyPromoteTimer) clearTimeout(entry.busyPromoteTimer)
            entry.busyPromoteTimer = setTimeout(() => {
              const s = useTerminalStore.getState().tabStatuses[tabId]
              if (s !== 'busy') useTerminalStore.getState().setTabStatus(tabId, 'busy')
            }, BUSY_SUSTAIN_MS)
          }
          lastOutputAt = now

          if (entry.idleTimer) clearTimeout(entry.idleTimer)
          entry.idleTimer = setTimeout(() => {
            const e = terminalsMap.get(tabId)
            if (e?.busyPromoteTimer) { clearTimeout(e.busyPromoteTimer); e.busyPromoteTimer = null }
            const prev = useTerminalStore.getState().tabStatuses[tabId]
            useTerminalStore.getState().setTabStatus(tabId, 'idle')
            if (isLlm) {
              const isActiveProject = useProjectStore.getState().activeProjectId === projectId
              if (prev !== 'idle' && !isActiveProject) {
                useTerminalStore.getState().markProjectAttention(projectId)
              }
              if (prev === 'busy' && isActiveProject) {
                const { idleSoundEnabled, idleSoundId } = useLayoutStore.getState()
                if (idleSoundEnabled) playSound(idleSoundId)
              }
            }
          }, 3000)
        }

        if (isLlm) {
          if (entry.bufferReadTimer) clearTimeout(entry.bufferReadTimer)
          entry.bufferReadTimer = setTimeout(() => {
            const te = terminalsMap.get(tabId)
            if (!te) return
            te.bufferReadTimer = null
            const buf = te.terminal.buffer.active
            const sig = `${buf.baseY}:${buf.cursorY}:${buf.cursorX}`
            if (sig === te.lastBufferSig) return
            te.lastBufferSig = sig
            const extracted: string[] = []
            let latestTokens: number | null = null
            const rows = te.terminal.rows
            for (let y = 0; y < rows; y++) {
              const row = buf.getLine(buf.baseY + y)
              if (!row) continue
              const text = row.translateToString(true)
              if (text.trim()) extracted.push(text)
              const tokens = parseTokenCount(stripAnsi(text))
              if (tokens !== null) latestTokens = tokens
            }
            if (extracted.length > 0) {
              useTerminalStore.getState().setOutput(projectId, extracted)
            }
            if (latestTokens !== null) {
              useTerminalStore.getState().setTokenUsage(tabId, latestTokens)
              window.api.tokenUsage.record(tabId, projectId, latestTokens)
            }
          }, BUFFER_SCAN_DEBOUNCE_MS)
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

        terminal.registerLinkProvider({
          provideLinks: (lineNumber, callback) => {
            const buf = terminal.buffer.active
            const row = buf.getLine(lineNumber - 1)
            if (!row) { callback(undefined); return }
            const text = row.translateToString(true)
            const matches = findFileMatches(text)
            if (matches.length === 0) { callback(undefined); return }
            callback(matches.map((m) => ({
              range: {
                start: { x: m.start + 1, y: lineNumber },
                end: { x: m.end, y: lineNumber }
              },
              text: text.slice(m.start, m.end),
              activate: () => openPathFromTerminal(projectId, cwd, m.rawPath, m.line)
            })))
          }
        })

        const textarea = terminal.textarea
        if (textarea) {
          const onFocus = (): void => {
            useTerminalStore.getState().setFocusedTabId(tabId)
          }
          const onBlur = (): void => {
            if (useTerminalStore.getState().focusedTabId === tabId) {
              useTerminalStore.getState().setFocusedTabId(null)
            }
          }
          textarea.addEventListener('focus', onFocus)
          textarea.addEventListener('blur', onBlur)
          const e = terminalsMap.get(tabId)
          if (e) e.textareaListeners = { textarea, onFocus, onBlur }
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

        const refit = (): void => {
          try {
            if (el.clientWidth === 0 || el.clientHeight === 0) return
            fitAddon.fit()
          } catch { /* disposed */ }
        }
        requestAnimationFrame(refit)
        setTimeout(refit, 100)
        setTimeout(refit, 500)
        if (typeof document !== 'undefined' && (document as Document & { fonts?: FontFaceSet }).fonts?.ready) {
          (document as Document & { fonts: FontFaceSet }).fonts.ready.then(refit).catch(() => { /* ignore */ })
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
    const runFit = (): void => {
      try {
        if (!el.contains(terminal.element ?? null)) return
        if (el.clientWidth === 0 || el.clientHeight === 0) return
        const buf = terminal.buffer.active
        const atBottom = buf.baseY - buf.viewportY <= 1
        fitAddon.fit()
        if (terminal.cols === prevCols && terminal.rows === prevRows) return
        prevCols = terminal.cols
        prevRows = terminal.rows
        const e = terminalsMap.get(tabId)
        if (e) e.suppressBusyUntil = Date.now() + 1000
        const autoScroll = useTerminalStore.getState().isAutoScroll(tabId)
        if (autoScroll && atBottom) terminal.scrollToBottom()
      } catch { /* element may be unmounted during resize */ }
    }

    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(runFit, 150)
    })
    observer.observe(el)

    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) runFit()
      }
    })
    intersectionObserver.observe(el)

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      const types = e.dataTransfer?.types
      if (types?.includes('Files') || types?.includes('application/x-vbcdr-file')) {
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

      const internalPath = e.dataTransfer?.getData('application/x-vbcdr-file')
      if (internalPath) {
        const rel = relativeToCwd(internalPath, cwd)
        terminalsMap.get(tabId)?.terminal.paste(`@${rel} `)
        const ext = internalPath.slice(internalPath.lastIndexOf('.')).toLowerCase()
        if (IMAGE_EXTENSIONS.has(ext)) {
          showImageThumbnailRef.current(internalPath)
        }
        focusTerminal(tabId)
        return
      }

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
      if (imagePaths.length > 0) {
        showImageThumbnailRef.current(imagePaths[imagePaths.length - 1])
      }

      if (otherPaths.length > 0) {
        terminalsMap.get(tabId)?.terminal.paste(otherPaths.join(' '))
      }

      if (imagePaths.length > 0 || otherPaths.length > 0) {
        focusTerminal(tabId)
      }
    }

    const onPaste = (e: ClipboardEvent): void => {
      const hasImage = e.clipboardData?.types.some((t) => t.startsWith('image/'))
      const hasText = e.clipboardData?.types.includes('text/plain')
      if (hasImage && !hasText) {
        e.preventDefault()
        e.stopPropagation()
        window.api.terminal.pasteClipboardImage(tabId)
        focusTerminal(tabId)
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    el.addEventListener('paste', onPaste, true)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current)
      observer.disconnect()
      intersectionObserver.disconnect()
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      el.removeEventListener('paste', onPaste, true)
    }
  }, [tabId, projectId, cwd, initialCommand])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
      {thumbSrc && <ImageThumbnail src={thumbSrc} onDismiss={() => dismissThumbnailRef.current()} />}
    </div>
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
  let attempts = 0
  const MAX_ATTEMPTS = 30
  const applyFit = (): void => {
    try {
      entry.fitAddon.fit()
      if (entry.terminal.cols < 2 || entry.terminal.rows < 2) {
        if (attempts++ < MAX_ATTEMPTS) requestAnimationFrame(applyFit)
        return
      }
      window.api.terminal.resize(tabId, entry.terminal.cols, entry.terminal.rows)
      entry.terminal.refresh(0, entry.terminal.rows - 1)
      if (useTerminalStore.getState().isAutoScroll(tabId)) entry.terminal.scrollToBottom()
      entry.terminal.focus()
    } catch { /* terminal may be disposed or not yet open */ }
  }
  applyFit()
}

export function disposeTerminal(tabId: string): void {
  const entry = terminalsMap.get(tabId)
  if (entry) {
    entry.onIncomingData = undefined
    if (entry.bufferReadTimer) { clearTimeout(entry.bufferReadTimer); entry.bufferReadTimer = null }
    if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = null }
    if (entry.busyPromoteTimer) { clearTimeout(entry.busyPromoteTimer); entry.busyPromoteTimer = null }
    if (entry.textareaListeners) {
      const { textarea, onFocus, onBlur } = entry.textareaListeners
      try { textarea.removeEventListener('focus', onFocus) } catch { /* textarea may already be gone */ }
      try { textarea.removeEventListener('blur', onBlur) } catch { /* textarea may already be gone */ }
      entry.textareaListeners = undefined
    }
    try { entry.terminal.dispose() } catch { /* dispose may throw if already gone */ }
    terminalsMap.delete(tabId)

    let projectStillHasTabs = false
    terminalsMap.forEach((e) => {
      if (e.projectId === entry.projectId) projectStillHasTabs = true
    })
    if (!projectStillHasTabs) {
      activityLastSent.delete(`${entry.projectId}:i`)
      activityLastSent.delete(`${entry.projectId}:o`)
    }
  }
  if (terminalsMap.size === 0 && globalDataUnsub) {
    try { globalDataUnsub() } catch { /* ignore */ }
    globalDataUnsub = null
  }
  window.api.tokenUsage.resetTab(tabId)
}
