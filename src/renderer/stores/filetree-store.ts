import { create } from 'zustand'
import type { FileNode } from '@/models/types'

interface FileTreeStore {
  treePerProject: Record<string, FileNode>
  expandedPerProject: Record<string, Set<string>>
  showIgnoredPerProject: Record<string, boolean>
  loadTree: (projectId: string, rootPath: string, showIgnored?: boolean) => Promise<void>
  setTree: (projectId: string, tree: FileNode) => void
  toggleExpanded: (projectId: string, path: string) => void
  toggleShowIgnored: (projectId: string, rootPath: string) => void
  getTree: (projectId: string) => FileNode | undefined
  getExpanded: (projectId: string) => Set<string>
  getShowIgnored: (projectId: string) => boolean
}

const EMPTY_SET = new Set<string>()

export const useFileTreeStore = create<FileTreeStore>((set, get) => ({
  treePerProject: {},
  expandedPerProject: {},
  showIgnoredPerProject: {},

  loadTree: async (projectId: string, rootPath: string, showIgnored?: boolean) => {
    const show = showIgnored ?? get().showIgnoredPerProject[projectId] ?? true
    const tree = await window.api.fs.readTree(rootPath, show)
    set((state) => ({
      treePerProject: { ...state.treePerProject, [projectId]: tree }
    }))
  },

  setTree: (projectId: string, tree: FileNode) => {
    set((state) => ({
      treePerProject: { ...state.treePerProject, [projectId]: tree }
    }))
  },

  toggleExpanded: (projectId: string, path: string) => {
    set((state) => {
      const prev = state.expandedPerProject[projectId] || new Set<string>()
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return {
        expandedPerProject: { ...state.expandedPerProject, [projectId]: next }
      }
    })
  },

  toggleShowIgnored: (projectId: string, rootPath: string) => {
    const current = get().showIgnoredPerProject[projectId] ?? true
    const next = !current
    set((state) => ({
      showIgnoredPerProject: { ...state.showIgnoredPerProject, [projectId]: next }
    }))
    window.api.fs.unwatch()
    window.api.fs.watch(rootPath, next)
    get().loadTree(projectId, rootPath, next)
  },

  getTree: (projectId: string) => {
    return get().treePerProject[projectId]
  },

  getExpanded: (projectId: string) => {
    return get().expandedPerProject[projectId] || EMPTY_SET
  },

  getShowIgnored: (projectId: string) => {
    return get().showIgnoredPerProject[projectId] ?? true
  }
}))
