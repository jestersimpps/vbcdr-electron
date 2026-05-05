import { dialog, BrowserWindow } from 'electron'
import { safeHandle } from '@main/ipc/safe-handle'
import Store from 'electron-store'
import { v4 as uuid } from 'uuid'
import path from 'path'
import type { Project } from '@main/models/types'
import { purgeProjectActivity } from '@main/services/activity-service'
import { purgeProjectTokenUsage } from '@main/services/token-usage-service'

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
  safeHandle('projects:list', (): Project[] => {
    return store.get('projects')
  })

  safeHandle('projects:add', async (event): Promise<Project | null> => {
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

  safeHandle('projects:remove', (_event, id: string): boolean => {
    const projects = store.get('projects')
    const removed = projects.find((p) => p.id === id)
    const filtered = projects.filter((p) => p.id !== id)
    store.set('projects', filtered)
    if (removed) {
      const archive = store.get('projectArchive').filter((a) => a.id !== id)
      archive.push({ id: removed.id, name: removed.name, path: removed.path, archivedAt: Date.now() })
      store.set('projectArchive', archive)
    }
    return true
  })

  safeHandle('projects:listArchived', (): ArchivedProject[] => {
    return store.get('projectArchive')
  })

  safeHandle('projects:unarchive', (_event, id: string): Project | null => {
    const archive = store.get('projectArchive')
    const archived = archive.find((a) => a.id === id)
    if (!archived) return null

    const projects = store.get('projects')
    if (projects.find((p) => p.id === id || p.path === archived.path)) {
      store.set('projectArchive', archive.filter((a) => a.id !== id))
      return projects.find((p) => p.id === id || p.path === archived.path) ?? null
    }

    const project: Project = {
      id: archived.id,
      name: archived.name,
      path: archived.path,
      lastOpened: Date.now()
    }
    projects.push(project)
    store.set('projects', projects)
    store.set('projectArchive', archive.filter((a) => a.id !== id))
    return project
  })

  safeHandle('projects:deleteArchived', (_event, id: string): boolean => {
    const archive = store.get('projectArchive')
    store.set('projectArchive', archive.filter((a) => a.id !== id))
    purgeProjectActivity(id)
    purgeProjectTokenUsage(id)
    return true
  })

  safeHandle('projects:reorder', (_event, orderedIds: string[]): boolean => {
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
