export interface Project {
  id: string
  name: string
  path: string
  lastOpened: number
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface TerminalTab {
  id: string
  title: string
  projectId: string
  cwd: string
  initialCommand?: string
}

export type DeviceMode = 'desktop' | 'ipad' | 'mobile'

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
  timestamp: number
}

export interface NetworkEntry {
  id: string
  method: string
  url: string
  status: number
  statusText: string
  type: string
  size: number
  duration: number
  timestamp: number
  mimeType: string
  remoteAddress: string
  protocol: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  postData?: string
}

export interface BrowserTab {
  id: string
  title: string
  projectId: string
  url: string
  deviceMode: DeviceMode
  consoleEntries: ConsoleEntry[]
  networkEntries: NetworkEntry[]
}

export interface PersistedBrowserTab {
  id: string
  url: string
  deviceMode: DeviceMode
  title: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  refs: string[]
  parents: string[]
}

export interface GitBranch {
  name: string
  current: boolean
}

export type GitFileStatus = 'modified' | 'added' | 'untracked' | 'deleted' | 'renamed' | 'conflict'

export interface OpenFile {
  path: string
  name: string
  content: string
  originalContent?: string | null
}

export interface SavedCredential {
  id: string
  domain: string
  username: string
  createdAt: number
  updatedAt: number
}

export interface PasswordPromptData {
  tabId: string
  domain: string
  username: string
  password: string
}
