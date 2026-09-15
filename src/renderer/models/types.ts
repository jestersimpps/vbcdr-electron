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
  truncated?: boolean
}

export interface WorktreeInfo {
  id: string
  path: string
  branch: string
  projectPath: string
}

export type PrState = 'none' | 'open' | 'merged' | 'closed' | 'unknown'

export interface GhStatus {
  available: boolean
  authenticated: boolean
  message: string | null
}

export interface TrackedWorktree extends WorktreeInfo {
  projectId: string
  label: string | null
  createdAt: number
  prUrl: string | null
  prState: PrState
  hasChanges: boolean
  conflictPaths: string[]
  lastCheckedAt: number | null
}

export interface TerminalTab {
  id: string
  title: string
  projectId: string
  cwd: string
  initialCommand?: string
  worktree?: WorktreeInfo
  /** Which "+" button opened this tab; drives the tab and pane border color. */
  profileId?: string
  /** Provider the start command behaves like, so Claude-only features follow the tab. */
  providerId?: 'claude' | 'codex' | 'custom'
  color?: string
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
  date: string
  isoDate: string
}

export interface StatsCommit {
  hash: string
  timestamp: number
  authorEmail: string
  authorName: string
  message: string
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

export interface GitOpResult {
  ok: boolean
  output: string
  error?: string
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
