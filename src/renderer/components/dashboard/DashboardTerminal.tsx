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

    const origWidth = termEl.offsetWidth
    const origHeight = termEl.offsetHeight

    termEl.style.width = `${origWidth}px`
    termEl.style.height = `${origHeight}px`

    container.appendChild(termEl)
    termEl.style.pointerEvents = 'none'
    entry.terminal.scrollToBottom()

    const viewport = termEl.querySelector('.xterm-viewport') as HTMLElement | null
    const prevOverflow = viewport?.style.overflowY ?? ''
    if (viewport) viewport.style.overflowY = 'hidden'

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (origWidth > 0 && origHeight > 0 && containerWidth > 0 && containerHeight > 0) {
      const scaleX = containerWidth / origWidth
      const scaleY = containerHeight / origHeight
      const scale = Math.min(scaleX, scaleY)
      const offsetX = (containerWidth - origWidth * scale) / 2
      const offsetY = (containerHeight - origHeight * scale) / 2
      termEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
      termEl.style.transformOrigin = 'top left'
    }

    return () => {
      if (viewport) viewport.style.overflowY = prevOverflow
      termEl.style.pointerEvents = ''
      termEl.style.transform = ''
      termEl.style.transformOrigin = ''
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

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded bg-zinc-950" />
}
