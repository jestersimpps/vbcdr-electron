import type { PrState } from '@/models/types'

/** A column id from the user's flow; see models/sdlc-flow. */
export type SdlcStage = string

/** What the last column's prompt left behind for the branch. */
export type SdlcDoneOutcome = 'pr' | 'merged' | 'branch' | 'no-pr'

export type SdlcTicketStatus = 'idle' | 'running' | 'blocked' | 'awaiting-approval' | 'failed'

export interface SdlcCheck {
  name: string
  passed: boolean
}

export type SdlcDiffLineKind = 'add' | 'remove' | 'context' | 'meta'

export interface SdlcDiffLine {
  kind: SdlcDiffLineKind
  text: string
}

export interface SdlcDiffFile {
  path: string
  added: number
  removed: number
  hunks: SdlcDiffLine[]
}

export interface SdlcActivityEntry {
  at: number
  text: string
}

export type SdlcCommentAuthor = 'you' | 'agent'

export interface SdlcComment {
  id: string
  author: SdlcCommentAuthor
  text: string
  at: number
  sentBack: boolean
}

export interface SdlcArtifacts {
  /** Each agent column's result as it wrote it, keyed by column id. */
  outputs: Record<string, string>
  diffFiles: SdlcDiffFile[]
  activity: SdlcActivityEntry[]
}

export type SdlcAttachmentKind = 'image' | 'file'

export interface SdlcAttachment {
  id: string
  name: string
  kind: SdlcAttachmentKind
  dataUrl: string | null
}

export interface SdlcTicket {
  id: string
  projectId: string
  title: string
  description: string
  stage: SdlcStage
  status: SdlcTicketStatus
  branch: string
  worktreePath: string
  worktreeId: string | null
  tabId: string | null
  agent: string
  createdAt: number
  updatedAt: number
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  checks: SdlcCheck[]
  attachments: SdlcAttachment[]
  comments: SdlcComment[]
  artifacts: SdlcArtifacts
  prUrl: string | null
  prState: PrState
  blockedReason: string | null
  /** When the last column's prompt was last run for this ticket; null until it has been. */
  doneActionAt: number | null
  /** Null while the last column's prompt is still running, or until it has run; tickets saved before it existed lack it. */
  doneOutcome?: SdlcDoneOutcome | null
}

export const EMPTY_ARTIFACTS: SdlcArtifacts = {
  outputs: {},
  diffFiles: [],
  activity: []
}

export interface NewSdlcTicketInput {
  projectId: string
  description: string
  attachments: SdlcAttachment[]
}
