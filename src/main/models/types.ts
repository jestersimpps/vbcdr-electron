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

export type DeviceMode = 'desktop' | 'ipad' | 'mobile'

interface DeviceConfig {
  mode: DeviceMode
  width: number
  height: number
  userAgent: string
}

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

export interface HistoryEntry {
  url: string
  title: string
  visitCount: number
  lastVisited: number
}

export interface Bookmark {
  id: string
  url: string
  title: string
  createdAt: number
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

export interface EncryptedCredential {
  id: string
  domain: string
  username: string
  encryptedPassword: string
  createdAt: number
  updatedAt: number
}

export type ClaudeSection = 'global' | 'hooks' | 'skills' | 'commands' | 'project'

export interface ClaudeFileEntry {
  name: string
  path: string
  section: ClaudeSection
}

export const DEVICE_CONFIGS: Record<DeviceMode, DeviceConfig> = {
  desktop: {
    mode: 'desktop',
    width: 1440,
    height: 900,
    userAgent: ''
  },
  ipad: {
    mode: 'ipad',
    width: 1024,
    height: 1366,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  },
  mobile: {
    mode: 'mobile',
    width: 390,
    height: 844,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  }
}
