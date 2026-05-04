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
  isGitignored?: boolean
  children?: FileNode[]
}

export interface TerminalTab {
  id: string
  title: string
  projectId: string
  cwd: string
  initialCommand?: string
  pendingWorktree?: boolean
}

export type WorktreeState = 'idle' | 'dirty' | 'ahead' | 'conflicted'

export interface WorktreeInfo {
  tabId: string
  projectRoot: string
  path: string
  branch: string
  baseBranch: string
  state: WorktreeState
  ahead: number
  changedFiles: number
  readyToMerge: boolean
}

export interface WorktreeMergeResult {
  ok: boolean
  reason?: string
  output?: string
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
  remote: boolean
}

export interface StatsCommit {
  hash: string
  timestamp: number
  authorEmail: string
  authorName: string
}

export interface LanguageTally {
  [language: string]: number
}

export interface GitCheckoutResult {
  success: boolean
  branch: string
  stashed: boolean
  error?: string
}

export interface BranchDriftInfo {
  ahead: number
  behind: number
  diverged: boolean
  remoteBranch: string | null
}

export interface ConflictInfo {
  path: string
  absolutePath: string
}

export type GitFileStatus = 'modified' | 'added' | 'untracked' | 'deleted' | 'renamed' | 'conflict'

export interface OpenFile {
  path: string
  name: string
  content: string
  originalContent?: string | null
  isBinary?: boolean
  isDirty?: boolean
}

export interface SearchResult {
  path: string
  relativePath: string
  name: string
  type: 'name' | 'content'
  line?: number
  lineContent?: string
}

export type ClaudeSection = 'global' | 'hooks' | 'skills' | 'commands' | 'project'

export interface ClaudeFileEntry {
  name: string
  path: string
  section: ClaudeSection
}
