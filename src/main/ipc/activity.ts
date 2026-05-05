import { safeHandle } from '@main/ipc/safe-handle'
import {
  recordActivity,
  getSessions,
  getAllSessions,
  type ActivityKind,
  type ActivitySession
} from '@main/services/activity-service'

export function registerActivityHandlers(): void {
  safeHandle(
    'activity:record',
    (_event, projectId: string, kind: ActivityKind): void => {
      recordActivity(projectId, kind)
    }
  )

  safeHandle(
    'activity:sessions',
    (_event, projectId: string, sinceIso: string | null, idleMinutes?: number): ActivitySession[] => {
      return getSessions(projectId, sinceIso, idleMinutes)
    }
  )

  safeHandle(
    'activity:all-sessions',
    (_event, sinceIso: string | null, idleMinutes?: number): ActivitySession[] => {
      return getAllSessions(sinceIso, idleMinutes)
    }
  )
}
