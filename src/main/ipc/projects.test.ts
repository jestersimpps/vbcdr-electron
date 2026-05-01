import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@main/models/types'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

class FakeStore {
  private state: { projects: Project[]; projectArchive: Array<{ id: string; name: string; path: string; archivedAt: number }> }
  constructor(opts: { defaults: { projects: Project[]; projectArchive: unknown[] } }) {
    const d = opts.defaults
    this.state = { projects: [...d.projects], projectArchive: [...(d.projectArchive as never)] }
  }
  get(key: 'projects' | 'projectArchive'): unknown {
    return this.state[key]
  }
  set(key: 'projects' | 'projectArchive', value: never): void {
    this.state[key] = value
  }
}

vi.mock('electron-store', () => ({
  default: FakeStore
}))

const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] as string[] }))

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...(args as [unknown, unknown])) },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) }
}))

const purgeProjectActivity = vi.fn()
const purgeProjectTokenUsage = vi.fn()

vi.mock('@main/services/activity-service', () => ({
  purgeProjectActivity: (...args: unknown[]) => purgeProjectActivity(...args)
}))
vi.mock('@main/services/token-usage-service', () => ({
  purgeProjectTokenUsage: (...args: unknown[]) => purgeProjectTokenUsage(...args)
}))

let registry: IpcRegistry

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({
    ipcMain: makeIpcMainMock(registry),
    dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...(args as [unknown, unknown])) },
    BrowserWindow: { fromWebContents: () => ({ id: 'win' }) }
  }))
  showOpenDialog.mockReset().mockResolvedValue({ canceled: true, filePaths: [] })
  purgeProjectActivity.mockClear()
  purgeProjectTokenUsage.mockClear()

  const { registerProjectHandlers } = await import('./projects')
  registerProjectHandlers()
})

describe('projects ipc', () => {
  describe('projects:add', () => {
    it('returns null when the dialog is canceled', async () => {
      const result = await invoke(registry, 'projects:add')
      expect(result).toBeNull()
    })

    it('returns the existing project if the path is already known', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const first = await invoke<Project>(registry, 'projects:add')
      expect(first?.path).toBe('/work')

      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const second = await invoke<Project>(registry, 'projects:add')
      expect(second?.id).toBe(first?.id)

      const list = await invoke<Project[]>(registry, 'projects:list')
      expect(list).toHaveLength(1)
    })

    it('restores an archived project when the same path is re-added', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const first = await invoke<Project>(registry, 'projects:add')
      await invoke(registry, 'projects:remove', first!.id)

      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const restored = await invoke<Project>(registry, 'projects:add')
      expect(restored?.id).toBe(first!.id)
    })
  })

  describe('projects:remove', () => {
    it('moves the project into the archive', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const project = await invoke<Project>(registry, 'projects:add')
      await invoke(registry, 'projects:remove', project!.id)

      const list = await invoke<Project[]>(registry, 'projects:list')
      const archive = await invoke<Array<{ id: string }>>(registry, 'projects:listArchived')
      expect(list).toHaveLength(0)
      expect(archive.map((a) => a.id)).toEqual([project!.id])
    })
  })

  describe('projects:unarchive', () => {
    it('returns the project from archive and adds it back to projects', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const project = await invoke<Project>(registry, 'projects:add')
      await invoke(registry, 'projects:remove', project!.id)

      const result = await invoke<Project>(registry, 'projects:unarchive', project!.id)
      expect(result?.id).toBe(project!.id)
      const list = await invoke<Project[]>(registry, 'projects:list')
      expect(list.map((p) => p.id)).toEqual([project!.id])
    })

    it('returns null when there is no archived entry for the id', async () => {
      const result = await invoke(registry, 'projects:unarchive', 'nope')
      expect(result).toBeNull()
    })
  })

  describe('projects:deleteArchived', () => {
    it('purges related activity + token usage and removes the archive entry', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/work'] })
      const project = await invoke<Project>(registry, 'projects:add')
      await invoke(registry, 'projects:remove', project!.id)

      const ok = await invoke<boolean>(registry, 'projects:deleteArchived', project!.id)
      expect(ok).toBe(true)
      expect(purgeProjectActivity).toHaveBeenCalledWith(project!.id)
      expect(purgeProjectTokenUsage).toHaveBeenCalledWith(project!.id)

      const archive = await invoke<unknown[]>(registry, 'projects:listArchived')
      expect(archive).toHaveLength(0)
    })
  })

  describe('projects:reorder', () => {
    it('reorders projects to match the supplied id list and appends unknowns last', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/a' as string] })
      const a = await invoke<Project>(registry, 'projects:add')
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/b' as string] })
      const b = await invoke<Project>(registry, 'projects:add')
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/c' as string] })
      const c = await invoke<Project>(registry, 'projects:add')

      await invoke(registry, 'projects:reorder', [c!.id, a!.id])
      const list = await invoke<Project[]>(registry, 'projects:list')
      expect(list.map((p) => p.id)).toEqual([c!.id, a!.id, b!.id])
    })
  })
})
