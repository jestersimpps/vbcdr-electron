import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { WorktreeInfo, WorktreeMergeResult } from '../main/models/types'

const api = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    listArchived: () => ipcRenderer.invoke('projects:listArchived'),
    add: () => ipcRenderer.invoke('projects:add'),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id),
    unarchive: (id: string) => ipcRenderer.invoke('projects:unarchive', id),
    deleteArchived: (id: string) => ipcRenderer.invoke('projects:deleteArchived', id),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('projects:reorder', orderedIds)
  },

  claude: {
    homePath: () => ipcRenderer.invoke('claude:home-path') as Promise<string>,
    scanFiles: (projectPath: string) => ipcRenderer.invoke('claude:scan-files', projectPath),
    readFile: (filePath: string, projectPath: string) => ipcRenderer.invoke('claude:read-file', filePath, projectPath),
    writeFile: (filePath: string, content: string, projectPath: string) => ipcRenderer.invoke('claude:write-file', filePath, content, projectPath),
    deleteFile: (filePath: string, projectPath: string) => ipcRenderer.invoke('claude:delete-file', filePath, projectPath)
  },

  fs: {
    readTree: (rootPath: string, showIgnored?: boolean) => ipcRenderer.invoke('fs:read-tree', rootPath, showIgnored ?? false),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', filePath, content),
    deleteFile: (filePath: string) => ipcRenderer.invoke('fs:delete-file', filePath),
    createFile: (filePath: string) => ipcRenderer.invoke('fs:create-file', filePath),
    createFolder: (folderPath: string) => ipcRenderer.invoke('fs:create-folder', folderPath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    duplicate: (filePath: string) => ipcRenderer.invoke('fs:duplicate', filePath) as Promise<string>,
    search: (rootPath: string, query: string) => ipcRenderer.invoke('fs:search', rootPath, query),
    showInFolder: (filePath: string) => ipcRenderer.invoke('fs:show-in-folder', filePath),
    watch: (rootPath: string, showIgnored?: boolean) => ipcRenderer.invoke('fs:watch', rootPath, showIgnored ?? false),
    unwatch: () => ipcRenderer.invoke('fs:unwatch'),
    onTreeChanged: (callback: (tree: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tree: unknown) => callback(tree)
      ipcRenderer.on('fs:tree-changed', handler)
      return () => ipcRenderer.removeListener('fs:tree-changed', handler)
    },
    onFileChanged: (callback: (path: string, content: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, path: string, content: string) =>
        callback(path, content)
      ipcRenderer.on('fs:file-changed', handler)
      return () => ipcRenderer.removeListener('fs:file-changed', handler)
    }
  },

  terminal: {
    create: (tabId: string, projectId: string, cwd: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:create', tabId, projectId, cwd, cols, rows),
    write: (tabId: string, data: string) =>
      ipcRenderer.invoke('terminal:write', tabId, data),
    resize: (tabId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', tabId, cols, rows),
    kill: (tabId: string) => ipcRenderer.invoke('terminal:kill', tabId),
    has: (tabId: string) => ipcRenderer.invoke('terminal:has', tabId) as Promise<boolean>,
    pasteImage: (tabId: string, filePath: string) =>
      ipcRenderer.invoke('terminal:paste-image', tabId, filePath),
    pasteClipboardImage: (tabId: string) =>
      ipcRenderer.invoke('terminal:paste-clipboard-image', tabId) as Promise<boolean>,
    onData: (callback: (tabId: string, data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tabId: string, data: string) =>
        callback(tabId, data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (callback: (tabId: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tabId: string, exitCode: number) =>
        callback(tabId, exitCode)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    }
  },

  git: {
    isRepo: (cwd: string) => ipcRenderer.invoke('git:is-repo', cwd),
    commits: (cwd: string, maxCount?: number) => ipcRenderer.invoke('git:commits', cwd, maxCount),
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    fileAtHead: (cwd: string, filePath: string) => ipcRenderer.invoke('git:file-at-head', cwd, filePath),
    fileAtRef: (cwd: string, ref: string, filePath: string) => ipcRenderer.invoke('git:file-at-ref', cwd, ref, filePath),
    commitFiles: (cwd: string, hash: string) => ipcRenderer.invoke('git:commit-files', cwd, hash),
    diffNumstat: (cwd: string, hash?: string) => ipcRenderer.invoke('git:diff-numstat', cwd, hash),
    rangeFiles: (cwd: string, from: string, to: string) => ipcRenderer.invoke('git:range-files', cwd, from, to),
    rangeNumstat: (cwd: string, from: string, to: string) => ipcRenderer.invoke('git:range-numstat', cwd, from, to),
    rangeFileCount: (cwd: string, from: string, to: string) => ipcRenderer.invoke('git:range-file-count', cwd, from, to),
    rangeHashes: (cwd: string, from: string, to: string) => ipcRenderer.invoke('git:range-hashes', cwd, from, to),
    commitsFileCounts: (cwd: string, hashes: string[]) => ipcRenderer.invoke('git:commits-file-counts', cwd, hashes),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke('git:checkout', cwd, branch),
    defaultBranch: (cwd: string) => ipcRenderer.invoke('git:default-branch', cwd),
    diffSummary: (cwd: string, baseBranch: string) => ipcRenderer.invoke('git:diff-summary', cwd, baseBranch),
    registerFetch: (projectId: string, cwd: string) => ipcRenderer.invoke('git:register-fetch', projectId, cwd),
    unregisterFetch: (projectId: string) => ipcRenderer.invoke('git:unregister-fetch', projectId),
    fetchNow: (cwd: string) => ipcRenderer.invoke('git:fetch-now', cwd),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    rebaseRemote: (cwd: string) => ipcRenderer.invoke('git:rebase-remote', cwd),
    commitAll: (cwd: string, message: string) => ipcRenderer.invoke('git:commit-all', cwd, message),
    commitPaths: (cwd: string, message: string, paths: string[]) => ipcRenderer.invoke('git:commit-paths', cwd, message, paths),
    firstChangedLine: (cwd: string, filePath: string) => ipcRenderer.invoke('git:first-changed-line', cwd, filePath),
    conflicts: (cwd: string) => ipcRenderer.invoke('git:conflicts', cwd),
    commitsSince: (cwd: string, sinceIso: string | null) => ipcRenderer.invoke('git:commits-since', cwd, sinceIso),
    userEmail: (cwd: string) => ipcRenderer.invoke('git:user-email', cwd),
    languageTally: (cwd: string) => ipcRenderer.invoke('git:language-tally', cwd),
    ignorePath: (cwd: string, filePath: string) => ipcRenderer.invoke('git:ignore-path', cwd, filePath),
    gitignoreList: (cwd: string) => ipcRenderer.invoke('git:gitignore-list', cwd),
    gitignoreRemove: (cwd: string, entry: string) => ipcRenderer.invoke('git:gitignore-remove', cwd, entry),
    onDrift: (callback: (projectId: string, drift: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, projectId: string, drift: unknown) =>
        callback(projectId, drift)
      ipcRenderer.on('git:drift', handler)
      return () => ipcRenderer.removeListener('git:drift', handler)
    }
  },

  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    getStatus: () => ipcRenderer.invoke('updater:status'),
    onStatus: (callback: (status: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    }
  },

  activity: {
    record: (projectId: string, kind: 'i' | 'o') =>
      ipcRenderer.invoke('activity:record', projectId, kind),
    sessions: (projectId: string, sinceIso: string | null, idleMinutes?: number) =>
      ipcRenderer.invoke('activity:sessions', projectId, sinceIso, idleMinutes),
    allSessions: (sinceIso: string | null, idleMinutes?: number) =>
      ipcRenderer.invoke('activity:all-sessions', sinceIso, idleMinutes)
  },

  tokenUsage: {
    record: (tabId: string, projectId: string, tokens: number) =>
      ipcRenderer.invoke('token-usage:record', tabId, projectId, tokens),
    resetTab: (tabId: string) => ipcRenderer.invoke('token-usage:reset-tab', tabId),
    daily: (sinceIso: string | null) => ipcRenderer.invoke('token-usage:daily', sinceIso),
    events: (sinceIso: string | null) => ipcRenderer.invoke('token-usage:events', sinceIso)
  },

  worktree: {
    create: (tabId: string, projectRoot: string, label: string) =>
      ipcRenderer.invoke('worktree:create', tabId, projectRoot, label) as Promise<WorktreeInfo | null>,
    info: (tabId: string, projectRoot: string) =>
      ipcRenderer.invoke('worktree:info', tabId, projectRoot) as Promise<WorktreeInfo | null>,
    remove: (tabId: string, projectRoot: string, options?: { force?: boolean; deleteBranch?: boolean }) =>
      ipcRenderer.invoke('worktree:remove', tabId, projectRoot, options) as Promise<void>,
    merge: (tabId: string, projectRoot: string, options?: { preMergeCommand?: string; preMergeTimeoutMs?: number }) =>
      ipcRenderer.invoke('worktree:merge', tabId, projectRoot, options) as Promise<WorktreeMergeResult>,
    setReady: (projectRoot: string, tabId: string, ready: boolean) =>
      ipcRenderer.invoke('worktree:set-ready', projectRoot, tabId, ready) as Promise<void>,
    prune: (projectRoot: string) =>
      ipcRenderer.invoke('worktree:prune', projectRoot) as Promise<void>,
    has: (tabId: string, projectRoot: string) =>
      ipcRenderer.invoke('worktree:has', tabId, projectRoot) as Promise<boolean>,
    list: (projectRoot: string) =>
      ipcRenderer.invoke('worktree:list', projectRoot),
    reconcile: (projectRoot: string) =>
      ipcRenderer.invoke('worktree:reconcile', projectRoot) as Promise<WorktreeInfo[]>,
    rebind: (projectRoot: string, oldTabId: string, newTabId: string) =>
      ipcRenderer.invoke('worktree:rebind', projectRoot, oldTabId, newTabId) as Promise<WorktreeInfo | null>
  },

  skills: {
    search: (query: string) => ipcRenderer.invoke('skills:search', query),
    top: () => ipcRenderer.invoke('skills:top'),
    list: (projectPath: string | null) => ipcRenderer.invoke('skills:list', projectPath),
    install: (repo: string, skillId: string, scope: 'project' | 'global', projectPath: string | null) =>
      ipcRenderer.invoke('skills:install', repo, skillId, scope, projectPath),
    uninstall: (skillName: string, scope: 'project' | 'global', projectPath: string | null) =>
      ipcRenderer.invoke('skills:uninstall', skillName, scope, projectPath),
    onOutput: (callback: (chunk: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on('skills:output', handler)
      return () => ipcRenderer.removeListener('skills:output', handler)
    }
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)