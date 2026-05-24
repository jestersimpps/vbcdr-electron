import { safeHandle } from '@main/ipc/safe-handle'
import { scanTsProject } from '@main/services/ts-project-scanner'

export function registerTsProjectHandlers(): void {
  safeHandle('tsproject:scan', async (_event, rootPath: string) => {
    return scanTsProject(rootPath)
  })
}
