import { create } from 'zustand'
import type { OpenFile, GitFileStatus, FileNode } from '@/models/types'

type CenterTab = 'editor' | 'claude' | 'skills' | 'terminals'

interface ProjectEditorState {
  openFiles: OpenFile[]
  activeFilePath: string | null
}

interface EditorStore {
  statePerProject: Record<string, ProjectEditorState>
  centerTabPerProject: Record<string, CenterTab>
  pendingRevealLine: Record<string, number>
  setCenterTab: (projectId: string, tab: CenterTab) => void
  openFile: (projectId: string, path: string, name: string, cwd?: string, gitStatus?: GitFileStatus) => Promise<void>
  closeFile: (projectId: string, path: string) => void
  setActiveFile: (projectId: string, path: string) => void
  updateFileContent: (filePath: string, content: string) => void
  editFileContent: (projectId: string, filePath: string, content: string) => void
  saveFile: (projectId: string, filePath: string) => Promise<boolean>
  reorderFiles: (projectId: string, fromIndex: number, toIndex: number) => void
  openDefaultFile: (projectId: string, tree: FileNode) => Promise<void>
  setPendingRevealLine: (filePath: string, line: number) => void
  consumePendingRevealLine: (filePath: string) => number | null
}

const EMPTY_STATE: ProjectEditorState = { openFiles: [], activeFilePath: null }

const DEFAULT_FILE_CANDIDATES = [
  'README.md',
  'readme.md',
  'package.json',
  'index.ts',
  'index.tsx',
  'index.js',
  'main.ts',
  'main.tsx',
  'main.js'
]

function findDefaultFile(tree: FileNode): { path: string; name: string } | null {
  if (!tree.children) return null
  for (const candidate of DEFAULT_FILE_CANDIDATES) {
    const found = tree.children.find((c) => !c.isDirectory && c.name === candidate)
    if (found) return { path: found.path, name: found.name }
  }
  const srcDir = tree.children.find((c) => c.isDirectory && c.name === 'src')
  if (srcDir?.children) {
    for (const candidate of ['index.ts', 'index.tsx', 'index.js', 'main.ts', 'main.tsx', 'main.js', 'App.tsx', 'App.ts']) {
      const found = srcDir.children.find((c) => !c.isDirectory && c.name === candidate)
      if (found) return { path: found.path, name: found.name }
    }
  }
  const firstFile = tree.children.find((c) => !c.isDirectory)
  return firstFile ? { path: firstFile.path, name: firstFile.name } : null
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  statePerProject: {},
  centerTabPerProject: {},
  pendingRevealLine: {},

  setPendingRevealLine: (filePath: string, line: number) => {
    set((s) => ({ pendingRevealLine: { ...s.pendingRevealLine, [filePath]: line } }))
  },

  consumePendingRevealLine: (filePath: string): number | null => {
    const line = get().pendingRevealLine[filePath]
    if (line === undefined) return null
    set((s) => {
      const next = { ...s.pendingRevealLine }
      delete next[filePath]
      return { pendingRevealLine: next }
    })
    return line
  },

  setCenterTab: (projectId: string, tab: CenterTab) => {
    set((s) => ({
      centerTabPerProject: { ...s.centerTabPerProject, [projectId]: tab }
    }))
  },

  openFile: async (projectId: string, path: string, name: string, cwd?: string, gitStatus?: GitFileStatus) => {
    const state = get().statePerProject[projectId] ?? EMPTY_STATE
    const existing = state.openFiles.find((f) => f.path === path)

    if (existing) {
      if (!existing.isDirty) {
        const { content, isBinary } = await window.api.fs.readFile(path)
        const needsOriginal = !isBinary && cwd && gitStatus && ['modified', 'deleted', 'renamed', 'conflict'].includes(gitStatus)
        const originalContent = needsOriginal ? await window.api.git.fileAtHead(cwd, path) : existing.originalContent
        set((s) => {
          const prev = s.statePerProject[projectId] ?? EMPTY_STATE
          const files = prev.openFiles.map((f) =>
            f.path === path ? { ...f, content, isBinary, originalContent } : f
          )
          return {
            statePerProject: {
              ...s.statePerProject,
              [projectId]: { openFiles: files, activeFilePath: path }
            },
            centerTabPerProject: { ...s.centerTabPerProject, [projectId]: 'editor' }
          }
        })
      } else {
        set((s) => ({
          statePerProject: {
            ...s.statePerProject,
            [projectId]: { ...state, activeFilePath: path }
          },
          centerTabPerProject: { ...s.centerTabPerProject, [projectId]: 'editor' }
        }))
      }
      return
    }

    const { content, isBinary } = await window.api.fs.readFile(path)
    const needsOriginal = !isBinary && cwd && gitStatus && ['modified', 'deleted', 'renamed', 'conflict'].includes(gitStatus)
    const originalContent = needsOriginal ? await window.api.git.fileAtHead(cwd, path) : undefined

    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: {
            openFiles: [...prev.openFiles, { path, name, content, originalContent, isBinary }],
            activeFilePath: path
          }
        },
        centerTabPerProject: { ...s.centerTabPerProject, [projectId]: 'editor' }
      }
    })
  },

  closeFile: (projectId: string, path: string) => {
    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      const next = prev.openFiles.filter((f) => f.path !== path)
      let nextActive = prev.activeFilePath
      if (prev.activeFilePath === path) {
        const idx = prev.openFiles.findIndex((f) => f.path === path)
        nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null
      }
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { openFiles: next, activeFilePath: nextActive }
        }
      }
    })
  },

  setActiveFile: (projectId: string, path: string) => {
    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { ...prev, activeFilePath: path }
        }
      }
    })
  },

  updateFileContent: (filePath: string, content: string) => {
    set((s) => {
      const updated = { ...s.statePerProject }
      let changed = false
      for (const [pid, state] of Object.entries(updated)) {
        const idx = state.openFiles.findIndex((f) => f.path === filePath)
        if (idx === -1) continue
        if (state.openFiles[idx].isDirty) continue
        if (state.openFiles[idx].content === content) continue
        changed = true
        const files = [...state.openFiles]
        files[idx] = { ...files[idx], content }
        updated[pid] = { ...state, openFiles: files }
      }
      return changed ? { statePerProject: updated } : s
    })
  },

  editFileContent: (projectId: string, filePath: string, content: string) => {
    set((s) => {
      const state = s.statePerProject[projectId]
      if (!state) return s
      const idx = state.openFiles.findIndex((f) => f.path === filePath)
      if (idx === -1) return s
      if (state.openFiles[idx].content === content) return s
      const files = [...state.openFiles]
      files[idx] = { ...files[idx], content, isDirty: true }
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { ...state, openFiles: files }
        }
      }
    })
  },

  saveFile: async (projectId: string, filePath: string): Promise<boolean> => {
    const state = get().statePerProject[projectId]
    if (!state) return false
    const file = state.openFiles.find((f) => f.path === filePath)
    if (!file) return false
    await window.api.fs.writeFile(filePath, file.content)
    set((s) => {
      const prev = s.statePerProject[projectId]
      if (!prev) return s
      const files = prev.openFiles.map((f) =>
        f.path === filePath ? { ...f, isDirty: false } : f
      )
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { ...prev, openFiles: files }
        }
      }
    })
    return true
  },

  reorderFiles: (projectId: string, fromIndex: number, toIndex: number) => {
    set((s) => {
      const prev = s.statePerProject[projectId]
      if (!prev) return s
      if (fromIndex === toIndex) return s
      if (fromIndex < 0 || fromIndex >= prev.openFiles.length) return s
      if (toIndex < 0 || toIndex >= prev.openFiles.length) return s
      const files = [...prev.openFiles]
      const [moved] = files.splice(fromIndex, 1)
      files.splice(toIndex, 0, moved)
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: { ...prev, openFiles: files }
        }
      }
    })
  },

  openDefaultFile: async (projectId: string, tree: FileNode): Promise<void> => {
    const state = get().statePerProject[projectId]
    if (state && state.openFiles.length > 0) return
    const file = findDefaultFile(tree)
    if (!file) return
    const { content, isBinary } = await window.api.fs.readFile(file.path)
    set((s) => {
      const prev = s.statePerProject[projectId] ?? EMPTY_STATE
      if (prev.openFiles.length > 0) return s
      return {
        statePerProject: {
          ...s.statePerProject,
          [projectId]: {
            openFiles: [{ path: file.path, name: file.name, content, isBinary }],
            activeFilePath: file.path
          }
        }
      }
    })
  }
}))
