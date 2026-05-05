import { safeHandle } from '@main/ipc/safe-handle'
import {
  recordTokenSnapshot,
  resetTabTokenTracking,
  getDailyUsage,
  getEvents,
  type DailyTokenUsage,
  type TokenEvent
} from '@main/services/token-usage-service'

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
