import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    add: () => ipcRenderer.invoke('projects:add'),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id)
  },

  claude: {
    scanFiles: (projectPath: string) => ipcRenderer.invoke('claude:scan-files', projectPath)
  },

  fs: {
    readTree: (rootPath: string) => ipcRenderer.invoke('fs:read-tree', rootPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', filePath, content),
    deleteFile: (filePath: string) => ipcRenderer.invoke('fs:delete-file', filePath),
    watch: (rootPath: string) => ipcRenderer.invoke('fs:watch', rootPath),
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
    pasteImage: (tabId: string, filePath: string) =>
      ipcRenderer.invoke('terminal:paste-image', tabId, filePath),
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
    fileAtHead: (cwd: string, filePath: string) => ipcRenderer.invoke('git:file-at-head', cwd, filePath)
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
    ) => ipcRenderer.invoke('browser:save-tabs', projectId, tabs, activeTabId)
  },

  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
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
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
