import { safeHandle } from '@main/ipc/safe-handle'
import { getAgentSessions, type AgentSession } from '@main/services/session-summary-service'

export function registerSessionSummaryHandlers(): void {
  safeHandle(
    'session-summary:list',
    (_event, projectPaths: string[], sinceIso: string | null): Promise<AgentSession[]> => {
      return getAgentSessions(projectPaths, sinceIso)
    }
  )
}
