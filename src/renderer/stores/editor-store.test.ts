import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from './editor-store'
import type { FileNode } from '@/models/types'

interface FsApiMock {
  readFile: ReturnType<typeof vi.fn>
  writeFile: ReturnType<typeof vi.fn>
}

interface GitApiMock {
  fileAtHead: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  const fs: FsApiMock = {
    readFile: vi.fn(async (p: string) => ({ content: `content:${p}`, isBinary: false })),
    writeFile: vi.fn(async () => undefined)
  }
  const git: GitApiMock = {
    fileAtHead: vi.fn(async () => 'HEAD-content')
  }
  ;(window as unknown as { api: { fs: FsApiMock; git: GitApiMock } }).api = {
    ...(window as unknown as { api: Record<string, unknown> }).api,
    fs,
    git
  } as never
  useEditorStore.setState({
    statePerProject: {},
    centerTabPerProject: {},
    pendingRevealLine: {}
  })
})

const fsApi = (): FsApiMock =>
  (window as unknown as { api: { fs: FsApiMock } }).api.fs
const gitApi = (): GitApiMock =>
  (window as unknown as { api: { git: GitApiMock } }).api.git

describe('editor-store', () => {
  describe('openFile', () => {
    it('opens a new file, marks it active, and switches center tab to editor', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      const state = useEditorStore.getState()
      expect(state.statePerProject.p1.openFiles).toHaveLength(1)
      expect(state.statePerProject.p1.openFiles[0]).toMatchObject({
        path: '/p/a.ts',
        name: 'a.ts',
        content: 'content:/p/a.ts',
        isBinary: false
      })
      expect(state.statePerProject.p1.activeFilePath).toBe('/p/a.ts')
      expect(state.centerTabPerProject.p1).toBe('editor')
    })

    it('fetches HEAD content for non-binary files with a relevant git status', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts', '/p', 'modified')
      expect(gitApi().fileAtHead).toHaveBeenCalledWith('/p', '/p/a.ts')
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].originalContent).toBe('HEAD-content')
    })

    it('skips HEAD lookup for binary files', async () => {
      fsApi().readFile.mockResolvedValueOnce({ content: '', isBinary: true })
      await useEditorStore.getState().openFile('p1', '/p/img.png', 'img.png', '/p', 'modified')
      expect(gitApi().fileAtHead).not.toHaveBeenCalled()
    })

    it('refreshes content from disk when reopening a clean file', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      fsApi().readFile.mockResolvedValueOnce({ content: 'reread', isBinary: false })
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].content).toBe('reread')
    })

    it('does not re-read disk when the file is dirty, just re-activates it', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().editFileContent('p1', '/p/a.ts', 'unsaved')
      fsApi().readFile.mockClear()

      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      expect(fsApi().readFile).not.toHaveBeenCalled()
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].content).toBe('unsaved')
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/a.ts')
    })
  })

  describe('closeFile', () => {
    it('removes the file and picks a sensible next-active tab', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      await useEditorStore.getState().openFile('p1', '/p/b.ts', 'b.ts')
      await useEditorStore.getState().openFile('p1', '/p/c.ts', 'c.ts')
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/c.ts')

      useEditorStore.getState().closeFile('p1', '/p/b.ts')
      const state = useEditorStore.getState()
      expect(state.statePerProject.p1.openFiles.map((f) => f.path)).toEqual(['/p/a.ts', '/p/c.ts'])
      expect(state.statePerProject.p1.activeFilePath).toBe('/p/c.ts')
    })

    it('falls back to the previous tab when the active one is closed', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      await useEditorStore.getState().openFile('p1', '/p/b.ts', 'b.ts')

      useEditorStore.getState().closeFile('p1', '/p/b.ts')
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/a.ts')
    })

    it('returns null active path when the last file is closed', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().closeFile('p1', '/p/a.ts')
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBeNull()
      expect(useEditorStore.getState().statePerProject.p1.openFiles).toHaveLength(0)
    })
  })

  describe('updateFileContent', () => {
    it('updates non-dirty files only and skips identical content', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().updateFileContent('/p/a.ts', 'fresh')
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].content).toBe('fresh')

      const before = useEditorStore.getState().statePerProject
      useEditorStore.getState().updateFileContent('/p/a.ts', 'fresh')
      expect(useEditorStore.getState().statePerProject).toBe(before)
    })

    it('does not overwrite a dirty file', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().editFileContent('p1', '/p/a.ts', 'dirty')
      useEditorStore.getState().updateFileContent('/p/a.ts', 'from-disk')
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].content).toBe('dirty')
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].isDirty).toBe(true)
    })
  })

  describe('editFileContent', () => {
    it('marks the file dirty and updates content', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().editFileContent('p1', '/p/a.ts', 'edited')
      const file = useEditorStore.getState().statePerProject.p1.openFiles[0]
      expect(file.content).toBe('edited')
      expect(file.isDirty).toBe(true)
    })

    it('is a no-op when the project or file is unknown', async () => {
      const before = useEditorStore.getState().statePerProject
      useEditorStore.getState().editFileContent('nope', '/p/x.ts', 'x')
      expect(useEditorStore.getState().statePerProject).toBe(before)

      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      const stateBefore = useEditorStore.getState().statePerProject
      useEditorStore.getState().editFileContent('p1', '/p/missing.ts', 'x')
      expect(useEditorStore.getState().statePerProject).toBe(stateBefore)
    })
  })

  describe('saveFile', () => {
    it('writes content to disk and clears isDirty', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().editFileContent('p1', '/p/a.ts', 'final')
      const ok = await useEditorStore.getState().saveFile('p1', '/p/a.ts')
      expect(ok).toBe(true)
      expect(fsApi().writeFile).toHaveBeenCalledWith('/p/a.ts', 'final')
      expect(useEditorStore.getState().statePerProject.p1.openFiles[0].isDirty).toBe(false)
    })

    it('returns false when the project or file is unknown', async () => {
      expect(await useEditorStore.getState().saveFile('nope', '/p/x.ts')).toBe(false)
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      expect(await useEditorStore.getState().saveFile('p1', '/p/missing.ts')).toBe(false)
    })
  })

  describe('reorderFiles', () => {
    it('moves a file from one index to another', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      await useEditorStore.getState().openFile('p1', '/p/b.ts', 'b.ts')
      await useEditorStore.getState().openFile('p1', '/p/c.ts', 'c.ts')

      useEditorStore.getState().reorderFiles('p1', 0, 2)
      expect(useEditorStore.getState().statePerProject.p1.openFiles.map((f) => f.path))
        .toEqual(['/p/b.ts', '/p/c.ts', '/p/a.ts'])
    })

    it('ignores out-of-range and same-index calls', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      await useEditorStore.getState().openFile('p1', '/p/b.ts', 'b.ts')
      const before = useEditorStore.getState().statePerProject

      useEditorStore.getState().reorderFiles('p1', 1, 1)
      useEditorStore.getState().reorderFiles('p1', -1, 0)
      useEditorStore.getState().reorderFiles('p1', 0, 5)
      useEditorStore.getState().reorderFiles('nope', 0, 1)

      expect(useEditorStore.getState().statePerProject).toBe(before)
    })
  })

  describe('pendingRevealLine', () => {
    it('stores and consumes the line, returning null on second read', () => {
      useEditorStore.getState().setPendingRevealLine('/p/a.ts', 42)
      expect(useEditorStore.getState().consumePendingRevealLine('/p/a.ts')).toBe(42)
      expect(useEditorStore.getState().consumePendingRevealLine('/p/a.ts')).toBeNull()
    })
  })

  describe('openDefaultFile', () => {
    const mkTree = (children: FileNode[]): FileNode => ({
      name: 'p',
      path: '/p',
      isDirectory: true,
      children
    })

    const fileNode = (name: string): FileNode => ({
      name,
      path: `/p/${name}`,
      isDirectory: false
    })

    it('opens README.md when present at the root', async () => {
      const tree = mkTree([fileNode('README.md'), fileNode('other.txt')])
      await useEditorStore.getState().openDefaultFile('p1', tree)
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/README.md')
    })

    it('falls back to a src/index.* file when no root candidate matches', async () => {
      const tree = mkTree([
        {
          name: 'src',
          path: '/p/src',
          isDirectory: true,
          children: [{ name: 'main.ts', path: '/p/src/main.ts', isDirectory: false }]
        }
      ])
      await useEditorStore.getState().openDefaultFile('p1', tree)
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/src/main.ts')
    })

    it('falls back to the first non-directory file when nothing matches', async () => {
      const tree = mkTree([fileNode('zzz.txt'), fileNode('aaa.log')])
      await useEditorStore.getState().openDefaultFile('p1', tree)
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/zzz.txt')
    })

    it('does nothing when the project already has open files', async () => {
      await useEditorStore.getState().openFile('p1', '/p/existing.ts', 'existing.ts')
      const tree = mkTree([fileNode('README.md')])
      fsApi().readFile.mockClear()

      await useEditorStore.getState().openDefaultFile('p1', tree)
      expect(fsApi().readFile).not.toHaveBeenCalled()
    })

    it('does nothing when no file can be picked', async () => {
      const tree = mkTree([])
      await useEditorStore.getState().openDefaultFile('p1', tree)
      expect(useEditorStore.getState().statePerProject.p1).toBeUndefined()
    })
  })

  describe('setCenterTab / setActiveFile', () => {
    it('updates centerTab without touching open files', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      useEditorStore.getState().setCenterTab('p1', 'claude')
      expect(useEditorStore.getState().centerTabPerProject.p1).toBe('claude')
      expect(useEditorStore.getState().statePerProject.p1.openFiles).toHaveLength(1)
    })

    it('setActiveFile changes the active path for the project', async () => {
      await useEditorStore.getState().openFile('p1', '/p/a.ts', 'a.ts')
      await useEditorStore.getState().openFile('p1', '/p/b.ts', 'b.ts')
      useEditorStore.getState().setActiveFile('p1', '/p/a.ts')
      expect(useEditorStore.getState().statePerProject.p1.activeFilePath).toBe('/p/a.ts')
    })
  })
})
