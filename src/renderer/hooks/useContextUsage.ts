import { useEffect } from 'react'
import { useTerminalStore } from '@/stores/terminal-store'
import { markTranscriptDriven } from '@/lib/transcript-driven-tabs'

const POLL_INTERVAL_MS = 2000

export function useContextUsage(
  tabId: string | null,
  projectId: string | null,
  cwd: string | null
): void {
  useEffect(() => {
    if (!tabId || !cwd) return
    let cancelled = false

    const poll = async (): Promise<void> => {
      const usage = await window.api.tokenUsage.context(cwd, tabId)
      if (cancelled || !usage) return
      markTranscriptDriven(tabId)
      useTerminalStore.getState().setTokenUsage(tabId, usage.contextTokens)
      if (projectId) {
        window.api.tokenUsage.record(tabId, projectId, usage.contextTokens)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return (): void => {
      cancelled = true
      clearInterval(interval)
    }
  }, [tabId, projectId, cwd])
}
