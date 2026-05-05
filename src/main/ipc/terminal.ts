import { BrowserWindow, nativeImage, clipboard } from 'electron'
import { createPty, writePty, resizePty, killPty, hasPty } from '@main/services/pty-manager'
import { safeHandle } from '@main/ipc/safe-handle'

export function registerTerminalHandlers(): void {
  safeHandle(
    'terminal:create',
    (event, tabId: string, projectId: string, cwd: string, cols: number, rows: number): void => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) createPty(tabId, projectId, cwd, win, cols, rows)
    }
  )

  safeHandle('terminal:write', (_event, tabId: string, data: string): void => {
    writePty(tabId, data)
  })

  safeHandle('terminal:resize', (_event, tabId: string, cols: number, rows: number): void => {
    resizePty(tabId, cols, rows)
  })

  safeHandle('terminal:kill', (_event, tabId: string): void => {
    killPty(tabId)
  })

  safeHandle('terminal:has', (_event, tabId: string): boolean => {
    return hasPty(tabId)
  })

  safeHandle('terminal:paste-image', (_event, tabId: string, filePath: string): void => {
    const image = nativeImage.createFromPath(filePath)
    if (!image.isEmpty()) {
      clipboard.writeImage(image)
      writePty(tabId, '\x16')
    }
  })

  safeHandle('terminal:paste-clipboard-image', (_event, tabId: string): boolean => {
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      writePty(tabId, '\x16')
      return true
    }
    return false
  })
}
