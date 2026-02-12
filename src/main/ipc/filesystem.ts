import fs from 'fs'
import { ipcMain, BrowserWindow } from 'electron'
import { readTree, readFileContents, startWatching, stopWatching } from '@main/services/file-watcher'
import type { FileReadResult } from '@main/services/file-watcher'
import type { FileNode } from '@main/models/types'

export function registerFilesystemHandlers(): void {
  ipcMain.handle('fs:read-tree', (_event, rootPath: string): FileNode => {
    return readTree(rootPath)
  })

  ipcMain.handle('fs:watch', (event, rootPath: string): void => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) startWatching(rootPath, win)
  })

  ipcMain.handle('fs:read-file', (_event, filePath: string): FileReadResult => {
    return readFileContents(filePath)
  })

  ipcMain.handle('fs:unwatch', (): void => {
    stopWatching()
  })

  ipcMain.handle('fs:write-file', (_event, filePath: string, content: string): void => {
    fs.writeFileSync(filePath, content, 'utf-8')
  })

  ipcMain.handle('fs:delete-file', (_event, filePath: string): void => {
    fs.unlinkSync(filePath)
  })
}
