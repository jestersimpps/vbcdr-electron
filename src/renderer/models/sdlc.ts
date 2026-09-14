export type SdlcStage = 'backlog' | 'planning' | 'implementing' | 'review' | 'done'

export type SdlcTicketStatus = 'idle' | 'running' | 'blocked' | 'awaiting-approval' | 'failed'

export interface SdlcStageDefinition {
  id: SdlcStage
  label: string
  description: string
  autonomous: boolean
}

export const SDLC_STAGES: readonly SdlcStageDefinition[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    description: 'Queued tickets with no worktree yet',
    autonomous: false
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Agent explores the repo and drafts a plan',
    autonomous: true
  },
  {
    id: 'implementing',
    label: 'Implementing',
    description: 'Agent writes code and runs checks in its worktree',
    autonomous: true
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Human reviews the diff before merge',
    autonomous: false
  },
  {
    id: 'done',
    label: 'Done',
    description: 'Merged and worktree removed',
    autonomous: false
  }
] as const

export type ModelProviderId = 'anthropic' | 'openai'

export interface ModelProviderDefinition {
  id: ModelProviderId
  label: string
}

export const MODEL_PROVIDERS: readonly ModelProviderDefinition[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' }
] as const

export interface StageModelAssignment {
  provider: ModelProviderId
  model: string | null
}

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
  plan: string[] | null
  diffFiles: SdlcDiffFile[]
  checkOutput: string | null
  prSummary: string | null
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
  blockedReason: string | null
}

export const EMPTY_ARTIFACTS: SdlcArtifacts = {
  plan: null,
  diffFiles: [],
  checkOutput: null,
  prSummary: null,
  activity: []
}

export function nextStage(stage: SdlcStage): SdlcStage | null {
  const index = SDLC_STAGES.findIndex((s) => s.id === stage)
  return SDLC_STAGES[index + 1]?.id ?? null
}

export function previousStage(stage: SdlcStage): SdlcStage | null {
  const index = SDLC_STAGES.findIndex((s) => s.id === stage)
  return index > 0 ? SDLC_STAGES[index - 1].id : null
}

export interface NewSdlcTicketInput {
  projectId: string
  description: string
  attachments: SdlcAttachment[]
}
