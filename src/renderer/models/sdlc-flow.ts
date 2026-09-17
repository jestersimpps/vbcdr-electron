import { DEFAULT_SDLC_STAGE_PROMPTS, SDLC_PLAN_RELATIVE, SENTINEL_CLAUSE } from '@/models/sdlc-prompts'

/** Human: the ticket waits. Agent: entering hands the column's prompt to a CLI agent. Terminal: the ticket ends and its worktree is gone. */
export type SdlcColumnKind = 'human' | 'agent' | 'terminal'

export type SdlcPanelKind = 'output' | 'reference' | 'checks' | 'diff' | 'activity'

export type SdlcOutputFormat = 'markdown' | 'raw'

export type SdlcExitAction = 'none' | 'pull-request'

/** Derived from a column's position and kind, never stored: the first column edits the raw ticket, a terminal one only looks back. */
export type SdlcColumnLayout = 'form' | 'workspace' | 'summary'

export interface SdlcPanelConfig {
  id: string
  kind: SdlcPanelKind
  label: string
  /** Output and reference panels: whose output to show. Null means the column the panel sits in. */
  sourceColumnId: string | null
  format: SdlcOutputFormat
  emptyText: string
}

export interface SdlcColumn {
  id: string
  label: string
  description: string
  kind: SdlcColumnKind
  prompt: string
  /** Skip the CLI's approval prompts. Off means the agent stops and asks, so the ticket will sit blocked until answered. */
  autonomous: boolean
  /** What the agent's result is called in the UI: "plan", "findings". */
  outputLabel: string
  /** Also keep the output as a document in the worktree, for later columns' agents to open. */
  outputFile: string | null
  panels: SdlcPanelConfig[]
  /** An auto-advancing ticket still stops here for a person. */
  requiresApproval: boolean
  /** Null sends a rejected ticket to the column on the left. */
  sendBackTo: string | null
  exitAction: SdlcExitAction
}

export interface SdlcPanelKindDefinition {
  kind: SdlcPanelKind
  label: string
  description: string
}

export const SDLC_PANEL_KINDS: readonly SdlcPanelKindDefinition[] = [
  { kind: 'output', label: 'Output', description: "This column's agent result" },
  { kind: 'reference', label: 'Reference', description: "An earlier column's result, collapsed" },
  { kind: 'checks', label: 'Checks', description: 'Pass and fail badges' },
  { kind: 'diff', label: 'Changed files', description: 'The diff on the ticket branch' },
  { kind: 'activity', label: 'Activity', description: 'The ticket history' }
] as const

export const NEW_AGENT_COLUMN_PROMPT = `Work on this ticket in the worktree at {{worktreePath}} (branch {{branch}}).

Title: {{title}}
Description:
{{description}}

Describe here what this column's agent should do and what it should report.

${SENTINEL_CLAUSE}`

let panelCounter = 0

export function makePanel(kind: SdlcPanelKind, patch: Partial<Omit<SdlcPanelConfig, 'id' | 'kind'>> = {}): SdlcPanelConfig {
  panelCounter += 1
  const definition = SDLC_PANEL_KINDS.find((d) => d.kind === kind)
  return {
    id: `p-${Date.now().toString(36)}-${panelCounter}`,
    kind,
    label: definition?.label ?? kind,
    sourceColumnId: null,
    format: 'markdown',
    emptyText: '',
    ...patch
  }
}

function panel(id: string, kind: SdlcPanelKind, patch: Partial<Omit<SdlcPanelConfig, 'id' | 'kind'>> = {}): SdlcPanelConfig {
  return { ...makePanel(kind, patch), id }
}

const COLUMN_BASE: Omit<SdlcColumn, 'id' | 'label' | 'description' | 'kind'> = {
  prompt: '',
  autonomous: true,
  outputLabel: 'result',
  outputFile: null,
  panels: [],
  requiresApproval: false,
  sendBackTo: null,
  exitAction: 'none'
}

export function defaultSdlcColumns(): SdlcColumn[] {
  return [
    {
      ...COLUMN_BASE,
      id: 'backlog',
      label: 'Backlog',
      description: 'Queued tickets with no worktree yet',
      kind: 'human'
    },
    {
      ...COLUMN_BASE,
      id: 'planning',
      label: 'Planning',
      description: 'Agent explores the repo and drafts a plan',
      kind: 'agent',
      prompt: DEFAULT_SDLC_STAGE_PROMPTS.planning,
      outputLabel: 'plan',
      outputFile: SDLC_PLAN_RELATIVE,
      panels: [
        panel('planning-output', 'output', {
          label: 'Proposed plan',
          emptyText: 'Agent is still exploring the repo. No plan yet.'
        })
      ]
    },
    {
      ...COLUMN_BASE,
      id: 'implementing',
      label: 'Implementing',
      description: 'Agent writes code and runs checks in its worktree',
      kind: 'agent',
      prompt: DEFAULT_SDLC_STAGE_PROMPTS.implementing,
      outputLabel: 'changes',
      panels: [
        panel('implementing-plan', 'reference', { label: 'Approved plan', sourceColumnId: 'planning' }),
        panel('implementing-checks', 'checks'),
        panel('implementing-output', 'output', {
          label: 'Output',
          format: 'raw',
          emptyText: 'No changes written yet.'
        }),
        panel('implementing-diff', 'diff')
      ]
    },
    {
      ...COLUMN_BASE,
      id: 'review',
      label: 'Review',
      description: 'Human reviews the diff before merge',
      kind: 'agent',
      prompt: DEFAULT_SDLC_STAGE_PROMPTS.review,
      outputLabel: 'review',
      exitAction: 'pull-request',
      panels: [
        panel('review-output', 'output', { label: 'Summary' }),
        panel('review-checks', 'checks'),
        panel('review-diff', 'diff')
      ]
    },
    {
      ...COLUMN_BASE,
      id: 'done',
      label: 'Done',
      description: 'Merged and worktree removed',
      kind: 'terminal',
      panels: [panel('done-checks', 'checks'), panel('done-diff', 'diff'), panel('done-activity', 'activity')]
    }
  ]
}

export function newAgentColumn(id: string, label: string): SdlcColumn {
  return {
    ...COLUMN_BASE,
    id,
    label,
    description: '',
    kind: 'agent',
    prompt: NEW_AGENT_COLUMN_PROMPT,
    panels: [makePanel('output', { label: 'Result' }), makePanel('diff')]
  }
}

/** What "reset" means for a column's prompt: the shipped one for a default column, the starter template for a custom one. */
export function defaultColumnPrompt(id: string): string {
  return findColumn(defaultSdlcColumns(), id)?.prompt || NEW_AGENT_COLUMN_PROMPT
}

/** Ticket stages and prompt variables are keyed by this, so it must survive a rename: derived once, never recomputed. */
export function columnIdFrom(label: string, taken: readonly string[]): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'column'
  if (!taken.includes(slug)) return slug
  let suffix = 2
  while (taken.includes(`${slug}-${suffix}`)) suffix += 1
  return `${slug}-${suffix}`
}

export function findColumn(columns: readonly SdlcColumn[], id: string): SdlcColumn | undefined {
  return columns.find((c) => c.id === id)
}

export function nextColumn(columns: readonly SdlcColumn[], id: string): SdlcColumn | null {
  const index = columns.findIndex((c) => c.id === id)
  return index < 0 ? null : columns[index + 1] ?? null
}

/** A configured target only counts while it still sits to the left: reordering or deleting it falls back to the neighbour. */
export function sendBackTarget(columns: readonly SdlcColumn[], id: string): SdlcColumn | null {
  const index = columns.findIndex((c) => c.id === id)
  if (index <= 0) return null
  const column = columns[index]
  if (column.kind === 'terminal') return null
  const configured = columns.slice(0, index).find((c) => c.id === column.sendBackTo)
  return configured ?? columns[index - 1]
}

export function columnLayout(columns: readonly SdlcColumn[], id: string): SdlcColumnLayout {
  const index = columns.findIndex((c) => c.id === id)
  if (index <= 0) return 'form'
  return columns[index].kind === 'terminal' ? 'summary' : 'workspace'
}

export function isAgentColumn(column: SdlcColumn | null | undefined): boolean {
  return column?.kind === 'agent'
}

/** Columns whose output a prompt or reference panel in `id` may read: only the agent columns before it have run by then. */
export function earlierAgentColumns(columns: readonly SdlcColumn[], id: string): SdlcColumn[] {
  const index = columns.findIndex((c) => c.id === id)
  return columns.slice(0, Math.max(index, 0)).filter(isAgentColumn)
}

const COLUMN_KINDS: readonly SdlcColumnKind[] = ['human', 'agent', 'terminal']
const PANEL_KINDS: readonly SdlcPanelKind[] = SDLC_PANEL_KINDS.map((d) => d.kind)

function sanitizePanel(value: unknown): SdlcPanelConfig | null {
  const raw = (value ?? {}) as Partial<SdlcPanelConfig>
  if (!PANEL_KINDS.includes(raw.kind as SdlcPanelKind)) return null
  const base = makePanel(raw.kind as SdlcPanelKind)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    kind: base.kind,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : base.label,
    sourceColumnId: typeof raw.sourceColumnId === 'string' ? raw.sourceColumnId : null,
    format: raw.format === 'raw' ? 'raw' : 'markdown',
    emptyText: typeof raw.emptyText === 'string' ? raw.emptyText : ''
  }
}

function sanitizeColumn(value: unknown): SdlcColumn | null {
  const raw = (value ?? {}) as Partial<SdlcColumn>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (!COLUMN_KINDS.includes(raw.kind as SdlcColumnKind)) return null
  return {
    id: raw.id,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : raw.id,
    description: typeof raw.description === 'string' ? raw.description : '',
    kind: raw.kind as SdlcColumnKind,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    autonomous: typeof raw.autonomous === 'boolean' ? raw.autonomous : true,
    outputLabel: typeof raw.outputLabel === 'string' && raw.outputLabel.trim() ? raw.outputLabel : 'result',
    outputFile: typeof raw.outputFile === 'string' && raw.outputFile.trim() ? raw.outputFile.trim() : null,
    panels: Array.isArray(raw.panels)
      ? raw.panels.map(sanitizePanel).filter((p): p is SdlcPanelConfig => p !== null)
      : [],
    requiresApproval: raw.requiresApproval === true,
    sendBackTo: typeof raw.sendBackTo === 'string' ? raw.sendBackTo : null,
    exitAction: raw.exitAction === 'pull-request' ? 'pull-request' : 'none'
  }
}

/**
 * The rest of the board leans on three invariants, so stored flows are forced
 * back into them rather than trusted: ids are unique, the first column is a
 * human one (no worktree exists yet) and exactly the last one is terminal.
 */
export function sanitizeColumns(value: unknown): SdlcColumn[] {
  if (!Array.isArray(value)) return defaultSdlcColumns()
  const seen = new Set<string>()
  const columns = value
    .map(sanitizeColumn)
    .filter((c): c is SdlcColumn => c !== null)
    .filter((c) => (seen.has(c.id) ? false : !!seen.add(c.id)))
  if (columns.length < 2) return defaultSdlcColumns()
  const last = columns.length - 1
  return columns.map((column, index) => {
    if (index === 0) return { ...column, kind: 'human' }
    if (index === last) return { ...column, kind: 'terminal' }
    return column.kind === 'terminal' ? { ...column, kind: 'human' } : column
  })
}
