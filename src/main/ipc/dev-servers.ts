import { shell } from 'electron'
import { listDevServers, killDevServer, type DevServer } from '@main/services/dev-server-scanner'
import { safeHandle } from '@main/ipc/safe-handle'

export function registerDevServerHandlers(): void {
  safeHandle('dev-servers:list', async (): Promise<DevServer[]> => {
    return listDevServers()
  })

  safeHandle('dev-servers:kill', (_event, pid: number, force?: boolean): boolean => {
    return killDevServer(pid, force ?? false)
  })

  safeHandle('dev-servers:open', async (_event, port: number): Promise<void> => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) return
    await shell.openExternal(`http://localhost:${port}`)
  })
}
