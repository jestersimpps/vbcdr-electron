import { useEffect, useRef } from 'react'
import { getTerminalInstance } from '@/components/terminal/TerminalInstance'

interface ModalTerminalProps {
  tabId: string
}

export function ModalTerminal({ tabId }: ModalTerminalProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const entry = getTerminalInstance(tabId)
    if (!entry) return

    const termEl = entry.terminal.element
    if (!termEl) return

    const originalParent = termEl.parentElement

    termEl.style.width = '100%'
    termEl.style.height = '100%'
    container.appendChild(termEl)

    const viewport = termEl.querySelector('.xterm-viewport') as HTMLElement | null
    const prevOverflow = viewport?.style.overflowY ?? ''
    if (viewport) viewport.style.overflowY = ''

    setTimeout(() => {
      entry.fitAddon.fit()
      entry.terminal.scrollToBottom()
      entry.terminal.focus()
    }, 50)

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          if (!container.contains(entry.terminal.element)) return
          const atBottom = entry.terminal.buffer.active.viewportY === entry.terminal.buffer.active.baseY
          entry.fitAddon.fit()
          if (atBottom) entry.terminal.scrollToBottom()
        } catch { /* may unmount during resize */ }
      }, 80)
    })
    observer.observe(container)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      observer.disconnect()
      if (viewport) viewport.style.overflowY = prevOverflow
      termEl.style.width = ''
      termEl.style.height = ''
      if (originalParent) {
        originalParent.appendChild(termEl)
      }
      setTimeout(() => {
        entry.fitAddon.fit()
        entry.terminal.refresh(0, entry.terminal.rows - 1)
      }, 50)
    }
  }, [tabId])

  return <div ref={containerRef} className="h-full w-full overflow-hidden bg-zinc-950" />
}
