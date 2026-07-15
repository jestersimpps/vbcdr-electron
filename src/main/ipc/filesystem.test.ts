import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

let projectRoot = ''

class FakeStore {
  get(_key: 'projects'): Array<{ id: string; name: string; path: string; lastOpened: number }> {
    return [{ id: 'p1', name: 'p', path: projectRoot, lastOpened: 0 }]
  }
}

vi.mock('electron-store', () => ({ default: FakeStore }))

const readTree = vi.fn(() => ({ name: 'p', path: '/p', isDirectory: true, children: [] }))
const startWatching = vi.fn()
const stopWatching = vi.fn()
const readFileContents = vi.fn(() => ({ content: 'data', isBinary: false }))

vi.mock('@main/services/file-watcher', () => ({
  readTree: (...args: unknown[]) => readTree(...args),
  startWatching: (...args: unknown[]) => startWatching(...args),
  stopWatching: () => stopWatching(),
  readFileContents: (...args: unknown[]) => readFileContents(...args)
}))

const showItemInFolder = vi.fn()
const openPath = vi.fn(async (_p: string) => '')
const showOpenDialog = vi.fn(async (..._args: unknown[]) => ({ canceled: true, filePaths: [] as string[] }))

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
  shell: { showItemInFolder: (p: string) => showItemInFolder(p), openPath: (p: string) => openPath(p) },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) }
}))

let registry: IpcRegistry

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-ipc-'))
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({
    ipcMain: makeIpcMainMock(registry),
    BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
    shell: { showItemInFolder: (p: string) => showItemInFolder(p), openPath: (p: string) => openPath(p) },
    dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) }
  }))
  readTree.mockClear()
  startWatching.mockClear()
  stopWatching.mockClear()
  readFileContents.mockClear()
  showItemInFolder.mockClear()
  openPath.mockClear()
  showOpenDialog.mockReset().mockResolvedValue({ canceled: true, filePaths: [] })
  const { registerFilesystemHandlers } = await import('./filesystem')
  registerFilesystemHandlers()
})

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('filesystem ipc', () => {
  describe('thin pass-throughs', () => {
    it('fs:read-tree forwards to readTree', async () => {
      await invoke(registry, 'fs:read-tree', '/some', true)
      expect(readTree).toHaveBeenCalledWith('/some', true)
    })

    it('fs:unwatch forwards to stopWatching', async () => {
      await invoke(registry, 'fs:unwatch')
      expect(stopWatching).toHaveBeenCalled()
    })

    it('fs:show-in-folder forwards to shell.showItemInFolder', async () => {
      await invoke(registry, 'fs:show-in-folder', '/whatever')
      expect(showItemInFolder).toHaveBeenCalledWith(path.resolve('/whatever'))
    })
  })

  describe('project-root guard', () => {
    it('fs:read-file rejects paths outside any registered project root', async () => {
      await expect(invoke(registry, 'fs:read-file', '/elsewhere/x.ts'))
        .rejects.toThrow(/outside project root/)
    })

    it('fs:read-file allows reads within the project root', async () => {
      const target = path.join(projectRoot, 'a.ts')
      fs.writeFileSync(target, 'x')
      await invoke(registry, 'fs:read-file', target)
      expect(readFileContents).toHaveBeenCalledWith(target)
    })

    it('fs:write-file rejects paths outside any project root', async () => {
      await expect(invoke(registry, 'fs:write-file', '/elsewhere/x.ts', 'data'))
        .rejects.toThrow(/outside project root/)
    })

    it('fs:write-file writes when within a project root', async () => {
      const target = path.join(projectRoot, 'b.ts')
      await invoke(registry, 'fs:write-file', target, 'hello')
      expect(fs.readFileSync(target, 'utf-8')).toBe('hello')
    })
  })

  describe('file ops', () => {
    it('fs:create-file creates an empty file', async () => {
      const target = path.join(projectRoot, 'created.ts')
      await invoke(registry, 'fs:create-file', target)
      expect(fs.existsSync(target)).toBe(true)
      expect(fs.readFileSync(target, 'utf-8')).toBe('')
    })

    it('fs:create-folder creates the directory recursively', async () => {
      const target = path.join(projectRoot, 'nested', 'dir')
      await invoke(registry, 'fs:create-folder', target)
      expect(fs.existsSync(target)).toBe(true)
      expect(fs.statSync(target).isDirectory()).toBe(true)
    })

    it('fs:rename moves the file when both paths are inside a project root', async () => {
      const oldPath = path.join(projectRoot, 'old.ts')
      const newPath = path.join(projectRoot, 'new.ts')
      fs.writeFileSync(oldPath, 'data')
      await invoke(registry, 'fs:rename', oldPath, newPath)
      expect(fs.existsSync(oldPath)).toBe(false)
      expect(fs.existsSync(newPath)).toBe(true)
    })

    it('fs:delete-file removes a file and an entire directory', async () => {
      const file = path.join(projectRoot, 'to-delete.ts')
      fs.writeFileSync(file, 'x')
      await invoke(registry, 'fs:delete-file', file)
      expect(fs.existsSync(file)).toBe(false)

      const dir = path.join(projectRoot, 'to-rm')
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, 'inner.ts'), '')
      await invoke(registry, 'fs:delete-file', dir)
      expect(fs.existsSync(dir)).toBe(false)
    })

    it('fs:duplicate creates a "(copy)" sibling and increments on collision', async () => {
      const original = path.join(projectRoot, 'a.ts')
      fs.writeFileSync(original, 'x')

      const first = await invoke<string>(registry, 'fs:duplicate', original)
      expect(first).toBe(path.join(projectRoot, 'a (copy).ts'))
      expect(fs.existsSync(first)).toBe(true)

      const second = await invoke<string>(registry, 'fs:duplicate', original)
      expect(second).toBe(path.join(projectRoot, 'a (copy 2).ts'))
    })
  })

  describe('fs:search', () => {
    it('matches by name and content within the project root', async () => {
      fs.writeFileSync(path.join(projectRoot, 'note.md'), 'hello world\nsecond hello\n')
      fs.writeFileSync(path.join(projectRoot, 'other.txt'), 'nothing here')
      type SearchResult = { type: 'name' | 'content'; line?: number; lineContent?: string }
      const results = await invoke<SearchResult[]>(registry, 'fs:search', projectRoot, 'hello')
      expect(results.some((r) => r.type === 'name')).toBe(false)
      const contentMatches = results.filter((r) => r.type === 'content')
      expect(contentMatches.length).toBeGreaterThanOrEqual(2)
      expect(contentMatches[0].lineContent).toContain('hello')
    })

    it('rejects searches in paths outside any project root', async () => {
      await expect(invoke(registry, 'fs:search', '/elsewhere', 'q'))
        .rejects.toThrow(/outside project root/)
    })

    it('skips files and directories matched by .gitignore, including nested ones', async () => {
      fs.writeFileSync(path.join(projectRoot, '.gitignore'), 'dist\n')
      fs.mkdirSync(path.join(projectRoot, 'dist'))
      fs.writeFileSync(path.join(projectRoot, 'dist', 'bundle.txt'), 'needle in ignored dir')
      fs.mkdirSync(path.join(projectRoot, 'sub'))
      fs.writeFileSync(path.join(projectRoot, 'sub', '.gitignore'), 'secret.txt\n')
      fs.writeFileSync(path.join(projectRoot, 'sub', 'secret.txt'), 'needle in nested ignored file')
      fs.writeFileSync(path.join(projectRoot, 'sub', 'visible.txt'), 'needle in visible file')

      type SearchResult = { relativePath: string; type: 'name' | 'content' }
      const results = await invoke<SearchResult[]>(registry, 'fs:search', projectRoot, 'needle')
      const paths = results.map((r) => r.relativePath)
      expect(paths).toEqual([path.join('sub', 'visible.txt')])
    })

    it('respects the excludeFolders argument', async () => {
      fs.mkdirSync(path.join(projectRoot, 'skip-me'))
      fs.writeFileSync(path.join(projectRoot, 'skip-me', 'a.txt'), 'needle here')
      fs.writeFileSync(path.join(projectRoot, 'keep.txt'), 'needle there')

      type SearchResult = { relativePath: string }
      const results = await invoke<SearchResult[]>(registry, 'fs:search', projectRoot, 'needle', ['skip-me'])
      expect(results.map((r) => r.relativePath)).toEqual(['keep.txt'])
    })
  })

  describe('fs:open-folder', () => {
    it('forwards to shell.openPath with a resolved path', async () => {
      await invoke(registry, 'fs:open-folder', '/some/folder')
      expect(openPath).toHaveBeenCalledWith(path.resolve('/some/folder'))
    })
  })

  describe('fs:pick-folder', () => {
    it('returns the selected directory', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/picked/dir'] })
      const result = await invoke<string | null>(registry, 'fs:pick-folder')
      expect(result).toBe('/picked/dir')
      expect(showOpenDialog).toHaveBeenCalledWith({ id: 'win' }, { properties: ['openDirectory'] })
    })

    it('returns null when the dialog is canceled', async () => {
      const result = await invoke<string | null>(registry, 'fs:pick-folder')
      expect(result).toBeNull()
    })
  })

  describe('fs:watch', () => {
    it('starts the watcher with the provided showIgnored flag', async () => {
      await invoke(registry, 'fs:watch', '/p', true)
      expect(startWatching).toHaveBeenCalledWith('/p', { id: 'win' }, true)
    })
  })
})
