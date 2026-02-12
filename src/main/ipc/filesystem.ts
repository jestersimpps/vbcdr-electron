import fs from 'fs'
import path from 'path'
import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { readTree, readFileContents, startWatching, stopWatching } from '@main/services/file-watcher'
import type { FileReadResult } from '@main/services/file-watcher'
import type { FileNode, Project } from '@main/models/types'

const store = new Store<{ projects: Project[] }>({ defaults: { projects: [] } })

function isWithinProjectRoot(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  const projects = store.get('projects')
  return projects.some((p) => resolved.startsWith(p.path + path.sep) || resolved === p.path)
}

export function registerFilesystemHandlers(): void {
  ipcMain.handle('fs:read-tree', (_event, rootPath: string): FileNode => {
    return readTree(rootPath)
  })

  ipcMain.handle('fs:watch', (event, rootPath: string): void => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) startWatching(rootPath, win)
  })

  ipcMain.handle('fs:read-file', (_event, filePath: string): FileReadResult => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    return readFileContents(resolved)
  })

  ipcMain.handle('fs:unwatch', (): void => {
    stopWatching()
  })

  ipcMain.handle('fs:write-file', (_event, filePath: string, content: string): void => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    fs.writeFileSync(resolved, content, 'utf-8')
  })

  ipcMain.handle('fs:delete-file', (_event, filePath: string): void => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    fs.unlinkSync(resolved)
  })
}
