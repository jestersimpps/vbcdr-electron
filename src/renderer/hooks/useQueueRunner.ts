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
  const itemsPerProject = useQueueStore((s) => s.itemsPerProject)
  const autoRunPerProject = useQueueStore((s) => s.autoRunPerProject)

  const activeTabId = activeProjectId ? activeTabPerProject[activeProjectId] ?? null : null
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const status = activeTabId ? tabStatuses[activeTabId] : undefined
  const items = activeProjectId ? itemsPerProject[activeProjectId] ?? [] : []
  const autoRun = activeProjectId ? autoRunPerProject[activeProjectId] ?? false : false

  const lastDispatchAtRef = useRef<number>(0)

  useEffect(() => {
    if (!activeProjectId || !activeTabId || !activeTab) return
    if (!activeTab.initialCommand) return
    if (!autoRun) return
    if (status !== 'idle') return
    if (items.length === 0) return
    if (Date.now() - lastDispatchAtRef.current < 2000) return

    const next = items[0]
    lastDispatchAtRef.current = Date.now()
    useTerminalStore.getState().setTabStatus(activeTabId, 'busy')
    useQueueStore.getState().dequeue(activeProjectId)
    sendToTerminal(activeTabId, next.text)
  }, [activeProjectId, activeTabId, activeTab?.initialCommand, status, autoRun, items])
}
