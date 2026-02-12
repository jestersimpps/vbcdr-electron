import { create } from 'zustand'
import type { ClaudeFileEntry, ClaudeSection } from '@/models/types'

interface ClaudeStore {
  filesPerProject: Record<string, ClaudeFileEntry[]>
  activeFilePerProject: Record<string, string | null>
  contentCache: Record<string, string>
  expandedSections: Record<string, Set<ClaudeSection>>
  loadFiles: (projectId: string, projectPath: string) => Promise<void>
  selectFile: (projectId: string, filePath: string) => Promise<void>
  saveFile: (filePath: string, content: string) => Promise<void>
  deleteFile: (projectId: string, filePath: string, projectPath: string) => Promise<void>
  toggleSection: (projectId: string, section: ClaudeSection) => void
}

const DEFAULT_EXPANDED = new Set<ClaudeSection>(['global', 'skills', 'commands', 'project'])

export const useClaudeStore = create<ClaudeStore>((set, get) => ({
  filesPerProject: {},
  activeFilePerProject: {},
  contentCache: {},
  expandedSections: {},

  loadFiles: async (projectId: string, projectPath: string) => {
    const files: ClaudeFileEntry[] = await window.api.claude.scanFiles(projectPath)
    set((s) => ({
      filesPerProject: { ...s.filesPerProject, [projectId]: files }
    }))
  },

  selectFile: async (projectId: string, filePath: string) => {
    const cached = get().contentCache[filePath]
    if (cached !== undefined) {
      set((s) => ({
        activeFilePerProject: { ...s.activeFilePerProject, [projectId]: filePath }
      }))
      return
    }
    const { content } = await window.api.fs.readFile(filePath)
    set((s) => ({
      activeFilePerProject: { ...s.activeFilePerProject, [projectId]: filePath },
      contentCache: { ...s.contentCache, [filePath]: content }
    }))
  },

  saveFile: async (filePath: string, content: string) => {
    await window.api.fs.writeFile(filePath, content)
    set((s) => ({
      contentCache: { ...s.contentCache, [filePath]: content }
    }))
  },

  deleteFile: async (projectId: string, filePath: string, projectPath: string) => {
    await window.api.fs.deleteFile(filePath)
    const { contentCache, activeFilePerProject } = get()
    const nextCache = { ...contentCache }
    delete nextCache[filePath]
    const wasActive = activeFilePerProject[projectId] === filePath
    set((s) => ({
      contentCache: nextCache,
      activeFilePerProject: wasActive
        ? { ...s.activeFilePerProject, [projectId]: null }
        : s.activeFilePerProject
    }))
    await get().loadFiles(projectId, projectPath)
  },

  toggleSection: (projectId: string, section: ClaudeSection) => {
    set((s) => {
      const current = s.expandedSections[projectId] ?? new Set(DEFAULT_EXPANDED)
      const next = new Set(current)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return { expandedSections: { ...s.expandedSections, [projectId]: next } }
    })
  }
}))
