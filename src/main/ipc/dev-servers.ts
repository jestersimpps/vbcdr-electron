import { ipcMain, shell } from 'electron'
import { listDevServers, killDevServer, type DevServer } from '@main/services/dev-server-scanner'

export function registerDevServerHandlers(): void {
  ipcMain.handle('dev-servers:list', async (): Promise<DevServer[]> => {
    return listDevServers()
  })

  ipcMain.handle('dev-servers:kill', (_event, pid: number, force?: boolean): boolean => {
    return killDevServer(pid, force ?? false)
  })

  ipcMain.handle('dev-servers:open', async (_event, port: number): Promise<void> => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) return
    await shell.openExternal(`http://localhost:${port}`)
  })
}
