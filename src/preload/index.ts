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
    create: (tabId: string, projectId: string, cwd: string) =>
      ipcRenderer.invoke('terminal:create', tabId, projectId, cwd),
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
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd)
  },

  browser: {
    create: () => ipcRenderer.invoke('browser:create'),
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('browser:set-bounds', bounds),
    setDevice: (mode: string) => ipcRenderer.invoke('browser:set-device', mode),
    back: () => ipcRenderer.invoke('browser:back'),
    forward: () => ipcRenderer.invoke('browser:forward'),
    reload: () => ipcRenderer.invoke('browser:reload'),
    destroy: () => ipcRenderer.invoke('browser:destroy'),
    onConsole: (callback: (entry: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: unknown) => callback(entry)
      ipcRenderer.on('browser:console', handler)
      return () => ipcRenderer.removeListener('browser:console', handler)
    },
    onNetwork: (callback: (entry: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: unknown) => callback(entry)
      ipcRenderer.on('browser:network', handler)
      return () => ipcRenderer.removeListener('browser:network', handler)
    }
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
