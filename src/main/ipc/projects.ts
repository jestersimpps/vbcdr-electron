import { ipcMain, dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { v4 as uuid } from 'uuid'
import path from 'path'
import type { Project } from '@main/models/types'
import { clearProjectTabs } from '@main/services/browser-persistence'
import { clearProjectCredentials } from '@main/services/credential-store'

export interface ArchivedProject {
  id: string
  name: string
  path: string
  archivedAt: number
}

const store = new Store<{ projects: Project[]; projectArchive: ArchivedProject[] }>({
  defaults: { projects: [], projectArchive: [] }
})

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:list', (): Project[] => {
    return store.get('projects')
  })

  ipcMain.handle('projects:add', async (event): Promise<Project | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const folderPath = result.filePaths[0]
    const projects = store.get('projects')

    const existing = projects.find((p) => p.path === folderPath)
    if (existing) return existing

    const archive = store.get('projectArchive')
    const archived = archive.find((a) => a.path === folderPath)

    const project: Project = {
      id: archived?.id ?? uuid(),
      name: archived?.name ?? path.basename(folderPath),
      path: folderPath,
      lastOpened: Date.now()
    }

    projects.push(project)
    store.set('projects', projects)
    if (archived) {
      store.set('projectArchive', archive.filter((a) => a.id !== archived.id))
    }
    return project
  })

  ipcMain.handle('projects:remove', (_event, id: string): boolean => {
    const projects = store.get('projects')
    const removed = projects.find((p) => p.id === id)
    const filtered = projects.filter((p) => p.id !== id)
    store.set('projects', filtered)
    if (removed) {
      const archive = store.get('projectArchive').filter((a) => a.id !== id)
      archive.push({ id: removed.id, name: removed.name, path: removed.path, archivedAt: Date.now() })
      store.set('projectArchive', archive)
    }
    clearProjectTabs(id)
    clearProjectCredentials(id)
    return true
  })

  ipcMain.handle('projects:listArchived', (): ArchivedProject[] => {
    return store.get('projectArchive')
  })

  ipcMain.handle('projects:reorder', (_event, orderedIds: string[]): boolean => {
    const projects = store.get('projects')
    const byId = new Map(projects.map((p) => [p.id, p]))
    const reordered: Project[] = []
    for (const id of orderedIds) {
      const project = byId.get(id)
      if (project) {
        reordered.push(project)
        byId.delete(id)
      }
    }
    for (const remaining of byId.values()) reordered.push(remaining)
    store.set('projects', reordered)
    return true
  })
}
