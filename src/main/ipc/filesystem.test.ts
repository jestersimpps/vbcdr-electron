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

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
  shell: { showItemInFolder: (p: string) => showItemInFolder(p) }
}))

let registry: IpcRegistry

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-ipc-'))
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({
    ipcMain: makeIpcMainMock(registry),
    BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
    shell: { showItemInFolder: (p: string) => showItemInFolder(p) }
  }))
  readTree.mockClear()
  startWatching.mockClear()
  stopWatching.mockClear()
  readFileContents.mockClear()
  showItemInFolder.mockClear()
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
  })

  describe('fs:watch', () => {
    it('starts the watcher with the provided showIgnored flag', async () => {
      await invoke(registry, 'fs:watch', '/p', true)
      expect(startWatching).toHaveBeenCalledWith('/p', { id: 'win' }, true)
    })
  })
})
