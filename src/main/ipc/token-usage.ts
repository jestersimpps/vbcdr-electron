import { safeHandle } from '@main/ipc/safe-handle'
import {
  recordTokenSnapshot,
  resetTabTokenTracking,
  getDailyUsage,
  getEvents,
  type DailyTokenUsage,
  type TokenEvent
} from '@main/services/token-usage-service'
import {
  readTranscriptUsage,
  type TranscriptUsage
} from '@main/services/transcript-usage-service'
import { getPtySpawnTime } from '@main/services/pty-manager'

export function registerTokenUsageHandlers(): void {
  safeHandle(
    'token-usage:record',
    (_event, tabId: string, projectId: string, tokens: number): void => {
      recordTokenSnapshot(tabId, projectId, tokens)
    }
  )

  safeHandle('token-usage:reset-tab', (_event, tabId: string): void => {
    resetTabTokenTracking(tabId)
  })

  safeHandle(
    'token-usage:context',
    (_event, cwd: string, tabId?: string): TranscriptUsage | null => {
      const sessionStartMs = tabId ? getPtySpawnTime(tabId) : null
      return readTranscriptUsage(cwd, sessionStartMs)
    }
  )

  safeHandle(
    'token-usage:daily',
    (_event, sinceIso: string | null): DailyTokenUsage[] => {
      return getDailyUsage(sinceIso)
    }
  )

  safeHandle(
    'token-usage:events',
    (_event, sinceIso: string | null): TokenEvent[] => {
      return getEvents(sinceIso)
    }
  )
}
