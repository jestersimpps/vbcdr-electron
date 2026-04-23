import { ipcMain } from 'electron'
import {
  recordTokenSnapshot,
  resetTabTokenTracking,
  getDailyUsage,
  getEvents,
  type DailyTokenUsage,
  type TokenEvent
} from '@main/services/token-usage-service'

export function registerTokenUsageHandlers(): void {
  ipcMain.handle(
    'token-usage:record',
    (_event, tabId: string, projectId: string, tokens: number): void => {
      recordTokenSnapshot(tabId, projectId, tokens)
    }
  )

  ipcMain.handle('token-usage:reset-tab', (_event, tabId: string): void => {
    resetTabTokenTracking(tabId)
  })

  ipcMain.handle(
    'token-usage:daily',
    (_event, sinceIso: string | null): DailyTokenUsage[] => {
      return getDailyUsage(sinceIso)
    }
  )

  ipcMain.handle(
    'token-usage:events',
    (_event, sinceIso: string | null): TokenEvent[] => {
      return getEvents(sinceIso)
    }
  )
}
