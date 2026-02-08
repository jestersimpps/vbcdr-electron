import { contextBridge, ipcRenderer } from 'electron'

const api = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    add: () => ipcRenderer.invoke('projects:add'),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id)
  },

  fs: {
    readTree: (rootPath: string) => ipcRenderer.invoke('fs:read-tree', rootPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    watch: (rootPath: string) => ipcRenderer.invoke('fs:watch', rootPath),
    unwatch: () => ipcRenderer.invoke('fs:unwatch'),
    onTreeChanged: (callback: (tree: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tree: unknown) => callback(tree)
      ipcRenderer.on('fs:tree-changed', handler)
      return () => ipcRenderer.removeListener('fs:tree-changed', handler)
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
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd)
  },

  browser: {
    attach: (tabId: string, webContentsId: number) =>
      ipcRenderer.invoke('browser:attach', tabId, webContentsId),
    setDevice: (tabId: string, mode: string) =>
      ipcRenderer.invoke('browser:set-device', tabId, mode),
    detach: (tabId: string) => ipcRenderer.invoke('browser:detach', tabId),
    onNetwork: (callback: (tabId: string, entry: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tabId: string, entry: unknown) =>
        callback(tabId, entry)
      ipcRenderer.on('browser:network', handler)
      return () => ipcRenderer.removeListener('browser:network', handler)
    }
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
