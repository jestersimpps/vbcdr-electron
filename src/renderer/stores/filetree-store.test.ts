import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileTreeStore } from './filetree-store'
import type { FileNode } from '@/models/types'

interface FsApiMock {
  readTree: ReturnType<typeof vi.fn>
  watch: ReturnType<typeof vi.fn>
  unwatch: ReturnType<typeof vi.fn>
}

const tree = (path: string, children?: FileNode[]): FileNode => ({
  name: path.split('/').pop() ?? path,
  path,
  isDirectory: !!children,
  children
})

beforeEach(() => {
  const fs: FsApiMock = {
    readTree: vi.fn(async () => tree('/p', [tree('/p/a.ts')])),
    watch: vi.fn(async () => undefined),
    unwatch: vi.fn(async () => undefined)
  }
  ;(window as unknown as { api: { fs: FsApiMock } }).api = {
    ...(window as unknown as { api: Record<string, unknown> }).api,
    fs
  } as never
  useFileTreeStore.setState({
    treePerProject: {},
    expandedPerProject: {},
    showIgnoredPerProject: {}
  })
})

const fsApi = (): FsApiMock => (window as unknown as { api: { fs: FsApiMock } }).api.fs

describe('filetree-store', () => {
  describe('loadTree', () => {
    it('reads the tree and stores it under the project id', async () => {
      const expected = tree('/p', [tree('/p/index.ts')])
      fsApi().readTree.mockResolvedValueOnce(expected)

      await useFileTreeStore.getState().loadTree('p1', '/p')

      expect(fsApi().readTree).toHaveBeenCalledWith('/p', false)
      expect(useFileTreeStore.getState().treePerProject.p1).toBe(expected)
    })

    it('uses the explicit showIgnored flag when provided', async () => {
      await useFileTreeStore.getState().loadTree('p1', '/p', true)
      expect(fsApi().readTree).toHaveBeenCalledWith('/p', true)
    })

    it('falls back to the persisted showIgnored value', async () => {
      useFileTreeStore.setState({ showIgnoredPerProject: { p1: true } })
      await useFileTreeStore.getState().loadTree('p1', '/p')
      expect(fsApi().readTree).toHaveBeenCalledWith('/p', true)
    })
  })

  describe('setTree', () => {
    it('replaces the tree for the project without touching others', () => {
      const initial = tree('/p', [tree('/p/old.ts')])
      const other = tree('/q', [tree('/q/x.ts')])
      useFileTreeStore.setState({ treePerProject: { p1: initial, p2: other } })

      const next = tree('/p', [tree('/p/new.ts')])
      useFileTreeStore.getState().setTree('p1', next)

      const state = useFileTreeStore.getState()
      expect(state.treePerProject.p1).toBe(next)
      expect(state.treePerProject.p2).toBe(other)
    })
  })

  describe('toggleExpanded', () => {
    it('adds and removes paths from the expanded set', () => {
      useFileTreeStore.getState().toggleExpanded('p1', '/p/src')
      expect(useFileTreeStore.getState().getExpanded('p1').has('/p/src')).toBe(true)

      useFileTreeStore.getState().toggleExpanded('p1', '/p/src')
      expect(useFileTreeStore.getState().getExpanded('p1').has('/p/src')).toBe(false)
    })

    it('keeps expanded sets independent across projects', () => {
      useFileTreeStore.getState().toggleExpanded('p1', '/p/a')
      useFileTreeStore.getState().toggleExpanded('p2', '/q/b')
      expect(useFileTreeStore.getState().getExpanded('p1').has('/p/a')).toBe(true)
      expect(useFileTreeStore.getState().getExpanded('p1').has('/q/b')).toBe(false)
      expect(useFileTreeStore.getState().getExpanded('p2').has('/q/b')).toBe(true)
    })
  })

  describe('toggleShowIgnored', () => {
    it('flips the flag, restarts the watcher, and reloads the tree', async () => {
      useFileTreeStore.getState().toggleShowIgnored('p1', '/p')

      expect(useFileTreeStore.getState().getShowIgnored('p1')).toBe(true)
      expect(fsApi().unwatch).toHaveBeenCalledTimes(1)
      expect(fsApi().watch).toHaveBeenCalledWith('/p', true)
      expect(fsApi().readTree).toHaveBeenCalledWith('/p', true)
    })
  })

  describe('getters', () => {
    it('returns undefined and an empty set when project is unknown', () => {
      const s = useFileTreeStore.getState()
      expect(s.getTree('nope')).toBeUndefined()
      expect(s.getExpanded('nope').size).toBe(0)
      expect(s.getShowIgnored('nope')).toBe(false)
    })
  })
})
