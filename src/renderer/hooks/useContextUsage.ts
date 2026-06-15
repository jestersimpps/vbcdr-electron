import { useEffect, useState } from 'react'
import { useTerminalStore } from '@/stores/terminal-store'
import { markTranscriptDriven, unmarkTranscriptDriven } from '@/lib/transcript-driven-tabs'

interface ContextUsage {
  model: string | null
  contextCap: number | null
}

const POLL_INTERVAL_MS = 2000

export function useContextUsage(
  tabId: string | null,
  projectId: string | null,
  cwd: string | null
): ContextUsage {
  const [model, setModel] = useState<string | null>(null)
  const [contextCap, setContextCap] = useState<number | null>(null)

  useEffect(() => {
    if (!tabId || !cwd) {
      setModel(null)
      setContextCap(null)
      return
    }
    let cancelled = false

    const poll = async (): Promise<void> => {
      const usage = await window.api.tokenUsage.context(cwd)
      if (cancelled || !usage) return
      markTranscriptDriven(tabId)
      setModel(usage.model)
      setContextCap(usage.contextCap)
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
      unmarkTranscriptDriven(tabId)
    }
  }, [tabId, projectId, cwd])

  return { model, contextCap }
}
