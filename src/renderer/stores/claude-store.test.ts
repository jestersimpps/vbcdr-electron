import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useClaudeStore } from './claude-store'
import type { ClaudeFileEntry } from '@/models/types'

interface ClaudeApiMock {
  scanFiles: ReturnType<typeof vi.fn>
  readFile: ReturnType<typeof vi.fn>
  writeFile: ReturnType<typeof vi.fn>
  deleteFile: ReturnType<typeof vi.fn>
}

const file = (name: string, path: string, section: ClaudeFileEntry['section'] = 'project'): ClaudeFileEntry => ({
  name,
  path,
  section
})

beforeEach(() => {
  const claude: ClaudeApiMock = {
    scanFiles: vi.fn(async () => [] as ClaudeFileEntry[]),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined)
  }
  ;(window as unknown as { api: { claude: ClaudeApiMock } }).api = {
    ...(window as unknown as { api: Record<string, unknown> }).api,
    claude
  } as never
  useClaudeStore.setState({
    filesPerProject: {},
    activeFilePerProject: {},
    contentCache: {},
    expandedSections: {},
    projectPaths: {}
  })
})

const claudeApi = (): ClaudeApiMock =>
  (window as unknown as { api: { claude: ClaudeApiMock } }).api.claude

describe('claude-store', () => {
  describe('loadFiles', () => {
    it('stores the scanned file list and remembers the project path', async () => {
      const files = [file('CLAUDE.md', '/p/CLAUDE.md'), file('h.md', '/p/.claude/hooks/h.md', 'hooks')]
      claudeApi().scanFiles.mockResolvedValueOnce(files)

      await useClaudeStore.getState().loadFiles('p1', '/p')

      const s = useClaudeStore.getState()
      expect(s.filesPerProject.p1).toEqual(files)
      expect(s.projectPaths.p1).toBe('/p')
      expect(claudeApi().scanFiles).toHaveBeenCalledWith('/p')
    })

    it('drops cached content for files that were previously loaded', async () => {
      claudeApi().scanFiles.mockResolvedValueOnce([file('a.md', '/p/a.md')])
      await useClaudeStore.getState().loadFiles('p1', '/p')
      useClaudeStore.setState({ contentCache: { '/p/a.md': 'cached', '/q/keep.md': 'other' } })

      claudeApi().scanFiles.mockResolvedValueOnce([file('a.md', '/p/a.md')])
      await useClaudeStore.getState().loadFiles('p1', '/p')

      const cache = useClaudeStore.getState().contentCache
      expect(cache['/p/a.md']).toBeUndefined()
      expect(cache['/q/keep.md']).toBe('other')
    })
  })

  describe('selectFile', () => {
    it('reads the file and caches its contents on first selection', async () => {
      useClaudeStore.setState({ projectPaths: { p1: '/p' } })
      claudeApi().readFile.mockResolvedValueOnce('contents')

      await useClaudeStore.getState().selectFile('p1', '/p/a.md')

      const s = useClaudeStore.getState()
      expect(s.activeFilePerProject.p1).toBe('/p/a.md')
      expect(s.contentCache['/p/a.md']).toBe('contents')
      expect(claudeApi().readFile).toHaveBeenCalledWith('/p/a.md', '/p')
    })

    it('does not re-read when the file is already cached', async () => {
      useClaudeStore.setState({
        projectPaths: { p1: '/p' },
        contentCache: { '/p/a.md': 'cached' }
      })

      await useClaudeStore.getState().selectFile('p1', '/p/a.md')

      expect(claudeApi().readFile).not.toHaveBeenCalled()
      expect(useClaudeStore.getState().activeFilePerProject.p1).toBe('/p/a.md')
    })
  })

  describe('saveFile', () => {
    it('writes the file via the api and updates the cache', async () => {
      useClaudeStore.setState({ projectPaths: { p1: '/p' } })

      await useClaudeStore.getState().saveFile('p1', '/p/a.md', 'updated')

      expect(claudeApi().writeFile).toHaveBeenCalledWith('/p/a.md', 'updated', '/p')
      expect(useClaudeStore.getState().contentCache['/p/a.md']).toBe('updated')
    })
  })

  describe('deleteFile', () => {
    it('clears the active selection and rescans the project', async () => {
      useClaudeStore.setState({
        projectPaths: { p1: '/p' },
        contentCache: { '/p/a.md': 'cached' },
        activeFilePerProject: { p1: '/p/a.md' }
      })
      claudeApi().scanFiles.mockResolvedValueOnce([file('b.md', '/p/b.md')])

      await useClaudeStore.getState().deleteFile('p1', '/p/a.md', '/p')

      const s = useClaudeStore.getState()
      expect(claudeApi().deleteFile).toHaveBeenCalledWith('/p/a.md', '/p')
      expect(s.contentCache['/p/a.md']).toBeUndefined()
      expect(s.activeFilePerProject.p1).toBeNull()
      expect(s.filesPerProject.p1).toEqual([file('b.md', '/p/b.md')])
    })

    it('keeps the active selection when a non-active file is deleted', async () => {
      useClaudeStore.setState({
        projectPaths: { p1: '/p' },
        activeFilePerProject: { p1: '/p/keep.md' }
      })
      claudeApi().scanFiles.mockResolvedValueOnce([])

      await useClaudeStore.getState().deleteFile('p1', '/p/other.md', '/p')

      expect(useClaudeStore.getState().activeFilePerProject.p1).toBe('/p/keep.md')
    })
  })

  describe('toggleSection', () => {
    it('removes the section when expanded and re-adds when collapsed', () => {
      useClaudeStore.getState().toggleSection('p1', 'hooks')
      let expanded = useClaudeStore.getState().expandedSections.p1
      expect(expanded.has('hooks')).toBe(false)
      expect(expanded.has('global')).toBe(true)

      useClaudeStore.getState().toggleSection('p1', 'hooks')
      expanded = useClaudeStore.getState().expandedSections.p1
      expect(expanded.has('hooks')).toBe(true)
    })

    it('keeps the per-project expansion sets independent', () => {
      useClaudeStore.getState().toggleSection('p1', 'hooks')
      useClaudeStore.getState().toggleSection('p2', 'global')
      const { expandedSections } = useClaudeStore.getState()
      expect(expandedSections.p1.has('hooks')).toBe(false)
      expect(expandedSections.p1.has('global')).toBe(true)
      expect(expandedSections.p2.has('global')).toBe(false)
      expect(expandedSections.p2.has('hooks')).toBe(true)
    })
  })
})
