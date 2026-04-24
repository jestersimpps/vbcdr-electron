import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    listArchived: () => ipcRenderer.invoke('projects:listArchived'),
    add: () => ipcRenderer.invoke('projects:add'),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('projects:reorder', orderedIds)
  },

  claude: {
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
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke('git:checkout', cwd, branch),
    defaultBranch: (cwd: string) => ipcRenderer.invoke('git:default-branch', cwd),
    diffSummary: (cwd: string, baseBranch: string) => ipcRenderer.invoke('git:diff-summary', cwd, baseBranch),
    registerFetch: (projectId: string, cwd: string) => ipcRenderer.invoke('git:register-fetch', projectId, cwd),
    unregisterFetch: (projectId: string) => ipcRenderer.invoke('git:unregister-fetch', projectId),
    fetchNow: (cwd: string) => ipcRenderer.invoke('git:fetch-now', cwd),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
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

  browser: {
    attach: (tabId: string, webContentsId: number) =>
      ipcRenderer.invoke('browser:attach', tabId, webContentsId),
    setDevice: (tabId: string, mode: string) =>
      ipcRenderer.invoke('browser:set-device', tabId, mode),
    detach: (tabId: string) => ipcRenderer.invoke('browser:detach', tabId),
    openDevTools: (webContentsId: number) =>
      ipcRenderer.invoke('browser:open-devtools', webContentsId),
    onReload: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('browser:reload', handler)
      return () => ipcRenderer.removeListener('browser:reload', handler)
    },
    onNetwork: (callback: (tabId: string, entry: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tabId: string, entry: unknown) =>
        callback(tabId, entry)
      ipcRenderer.on('browser:network', handler)
      return () => ipcRenderer.removeListener('browser:network', handler)
    },
    loadTabs: (projectId: string) => ipcRenderer.invoke('browser:load-tabs', projectId),
    saveTabs: (
      projectId: string,
      tabs: { id: string; url: string; deviceMode: string; title: string }[],
      activeTabId: string
    ) => ipcRenderer.invoke('browser:save-tabs', projectId, tabs, activeTabId),
    addHistory: (projectId: string, url: string, title: string) =>
      ipcRenderer.invoke('browser:add-history', projectId, url, title),
    getHistory: (projectId: string) =>
      ipcRenderer.invoke('browser:get-history', projectId),
    clearHistory: (projectId: string) =>
      ipcRenderer.invoke('browser:clear-history', projectId),
    addBookmark: (projectId: string, url: string, title: string) =>
      ipcRenderer.invoke('browser:add-bookmark', projectId, url, title),
    removeBookmark: (projectId: string, bookmarkId: string) =>
      ipcRenderer.invoke('browser:remove-bookmark', projectId, bookmarkId),
    getBookmarks: (projectId: string) =>
      ipcRenderer.invoke('browser:get-bookmarks', projectId),
    clearBodyCache: (tabId: string) =>
      ipcRenderer.invoke('browser:clear-body-cache', tabId),
    getResponseBody: (tabId: string, requestId: string) =>
      ipcRenderer.invoke('browser:get-response-body', tabId, requestId),
    captureHtml: (tabId: string) =>
      ipcRenderer.invoke('browser:capture-html', tabId),
    captureScreenshot: (tabId: string) =>
      ipcRenderer.invoke('browser:capture-screenshot', tabId)
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

  passwords: {
    save: (projectId: string, domain: string, username: string, password: string) =>
      ipcRenderer.invoke('passwords:save', projectId, domain, username, password),
    getForDomain: (projectId: string, domain: string) =>
      ipcRenderer.invoke('passwords:get-for-domain', projectId, domain),
    decrypt: (projectId: string, credentialId: string) =>
      ipcRenderer.invoke('passwords:decrypt', projectId, credentialId),
    list: (projectId: string) => ipcRenderer.invoke('passwords:list', projectId),
    delete: (projectId: string, credentialId: string) =>
      ipcRenderer.invoke('passwords:delete', projectId, credentialId),
    update: (projectId: string, credentialId: string, username: string, password: string) =>
      ipcRenderer.invoke('passwords:update', projectId, credentialId, username, password)
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

  skills: {
    search: (query: string) => ipcRenderer.invoke('skills:search', query),
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