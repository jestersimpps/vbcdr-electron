import { useEffect, useRef } from 'react'
import { getTerminalInstance } from '@/components/terminal/TerminalInstance'

interface DashboardTerminalProps {
  tabId: string
}

export function DashboardTerminal({ tabId }: DashboardTerminalProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const entry = getTerminalInstance(tabId)
    if (!entry) return

    const termEl = entry.terminal.element
    if (!termEl) return

    const originalParent = termEl.parentElement

    container.appendChild(termEl)
    entry.terminal.scrollToBottom()

    const viewport = termEl.querySelector('.xterm-viewport') as HTMLElement | null
    const prevOverflow = viewport?.style.overflowY ?? ''
    if (viewport) viewport.style.overflowY = 'hidden'

    const termWidth = termEl.offsetWidth
    const termHeight = termEl.offsetHeight
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (termWidth > 0 && termHeight > 0 && containerWidth > 0 && containerHeight > 0) {
      const scaleX = containerWidth / termWidth
      const scaleY = containerHeight / termHeight
      const scale = Math.min(scaleX, scaleY)
      termEl.style.transform = `scale(${scale})`
      termEl.style.transformOrigin = 'top left'
    }

    return () => {
      if (viewport) viewport.style.overflowY = prevOverflow
      termEl.style.transform = ''
      termEl.style.transformOrigin = ''
      if (originalParent) {
        originalParent.appendChild(termEl)
      }
      setTimeout(() => {
        entry.fitAddon.fit()
        entry.terminal.refresh(0, entry.terminal.rows - 1)
      }, 50)
    }
  }, [tabId])

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded bg-zinc-950" />
}
