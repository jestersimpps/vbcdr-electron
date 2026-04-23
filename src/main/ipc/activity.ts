import { ipcMain } from 'electron'
import {
  recordActivity,
  getSessions,
  getAllSessions,
  type ActivityKind,
  type ActivitySession
} from '@main/services/activity-service'

export function registerActivityHandlers(): void {
  ipcMain.handle(
    'activity:record',
    (_event, projectId: string, kind: ActivityKind): void => {
      recordActivity(projectId, kind)
    }
  )

  ipcMain.handle(
    'activity:sessions',
    (_event, projectId: string, sinceIso: string | null, idleMinutes?: number): ActivitySession[] => {
      return getSessions(projectId, sinceIso, idleMinutes)
    }
  )

  ipcMain.handle(
    'activity:all-sessions',
    (_event, sinceIso: string | null, idleMinutes?: number): ActivitySession[] => {
      return getAllSessions(sinceIso, idleMinutes)
    }
  )
}
