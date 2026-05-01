import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'
import { sendToTerminal } from '@/lib/send-to-terminal'

export function useQueueRunner(): void {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabPerProject = useTerminalStore((s) => s.activeTabPerProject)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const itemsPerTab = useQueueStore((s) => s.itemsPerTab)
  const autoRunPerTab = useQueueStore((s) => s.autoRunPerTab)

  const activeTabId = activeProjectId ? activeTabPerProject[activeProjectId] ?? null : null
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const status = activeTabId ? tabStatuses[activeTabId] : undefined
  const items = activeTabId ? itemsPerTab[activeTabId] ?? [] : []
  const autoRun = activeTabId ? autoRunPerTab[activeTabId] ?? false : false

  const lastDispatchAtRef = useRef<number>(0)

  useEffect(() => {
    if (!activeTabId || !activeTab) return
    if (!activeTab.initialCommand) return
    if (!autoRun) return
    if (status !== 'idle') return
    if (items.length === 0) return
    if (Date.now() - lastDispatchAtRef.current < 2000) return

    const next = items[0]
    lastDispatchAtRef.current = Date.now()
    useTerminalStore.getState().setTabStatus(activeTabId, 'busy')
    useQueueStore.getState().dequeue(activeTabId)
    sendToTerminal(activeTabId, next.text)
  }, [activeTabId, activeTab?.initialCommand, status, autoRun, items])
}
