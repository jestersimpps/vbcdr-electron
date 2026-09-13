import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'
import { sendToTerminalViaPty } from '@/lib/send-to-terminal'

const DISPATCH_COOLDOWN_MS = 2000

/**
 * `enabled` exists because TerminalPanel mounts more than once - the workspace
 * grid keeps its copy mounted-but-hidden while TerminalsPage renders another -
 * and every instance would otherwise run a runner against the same active tab.
 * The cooldown cannot arbitrate between them: lastDispatchAtPerTab is a ref, so
 * each copy keeps its own. Only the project-owned panel should dispatch.
 */
export function useQueueRunner(enabled: boolean = true): void {
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
  const autoRun = activeTabId ? autoRunPerTab[activeTabId] ?? true : false

  const lastDispatchAtPerTab = useRef<Map<string, number>>(new Map())
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    if (!activeTabId || !activeTab) return
    if (!activeTab.initialCommand) return
    if (!autoRun) return
    if (status !== 'idle') return
    if (items.length === 0) return

    const lastDispatchAt = lastDispatchAtPerTab.current.get(activeTabId) ?? 0
    const elapsed = Date.now() - lastDispatchAt
    if (elapsed < DISPATCH_COOLDOWN_MS) {
      const timer = setTimeout(() => setRetryTick((t) => t + 1), DISPATCH_COOLDOWN_MS - elapsed)
      return () => clearTimeout(timer)
    }

    let cancelled = false
    window.api.terminal.has(activeTabId).then((alive) => {
      if (cancelled || !alive) return
      const next = useQueueStore.getState().itemsPerTab[activeTabId]?.[0]
      if (!next) return
      lastDispatchAtPerTab.current.set(activeTabId, Date.now())
      useTerminalStore.getState().setTabStatus(activeTabId, 'busy')
      useQueueStore.getState().dequeue(activeTabId)
      sendToTerminalViaPty(activeTabId, next.text)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, activeTabId, activeTab?.initialCommand, status, autoRun, items, retryTick])
}
