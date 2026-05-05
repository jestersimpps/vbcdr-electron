import { ipcMain, type IpcMainInvokeEvent } from 'electron'

export function safeHandle(
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => any
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      console.error(`[ipc:${channel}]`, err)
      throw err
    }
  })
}
