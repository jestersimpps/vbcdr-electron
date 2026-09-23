import { DEFAULT_SDLC_STAGE_PROMPTS, SDLC_PLAN_RELATIVE, SENTINEL_CLAUSE } from '@/models/sdlc-prompts'

/** Human: the ticket waits. Agent: entering hands the column's prompt to a CLI agent. Terminal: the ticket ends and its worktree is gone. */
export type SdlcColumnKind = 'human' | 'agent' | 'terminal'

export interface SdlcColumn {
  id: string
  label: string
  kind: SdlcColumnKind
  /** The CLI an agent column starts in the ticket's worktree. Empty runs the default LLM tab. */
  command: string
  prompt: string
  /** Also keep the output as a document in the worktree, for later columns' agents to open. */
  outputFile: string | null
}

/** A column runs in a fresh worktree whose gitignored settings never carry the project's permission mode, so it would stop on its first tool call. */
export const DEFAULT_AGENT_COMMAND = 'claude --permission-mode bypassPermissions'

const ATTENDED_AGENT_COMMAND = 'claude'

export const NEW_AGENT_COLUMN_PROMPT = `Work on this ticket in the worktree at {{worktreePath}} (branch {{branch}}).

Title: {{title}}
Description:
{{description}}

Describe here what this column's agent should do and what it should report.

${SENTINEL_CLAUSE}`

function endColumn(id: string, label: string, kind: 'human' | 'terminal'): SdlcColumn {
  return { id, label, kind, command: '', prompt: '', outputFile: null }
}

function agentColumn(id: string, label: string, prompt: string, outputFile: string | null = null): SdlcColumn {
  return { id, label, kind: 'agent', command: DEFAULT_AGENT_COMMAND, prompt, outputFile }
}

export function defaultSdlcColumns(): SdlcColumn[] {
  return [
    endColumn('backlog', 'Backlog', 'human'),
    agentColumn('planning', 'Planning', DEFAULT_SDLC_STAGE_PROMPTS.planning, SDLC_PLAN_RELATIVE),
    agentColumn('implementing', 'Implementing', DEFAULT_SDLC_STAGE_PROMPTS.implementing),
    agentColumn('review', 'Review', DEFAULT_SDLC_STAGE_PROMPTS.review),
    endColumn('done', 'Done', 'terminal')
  ]
}

export function newAgentColumn(id: string, label: string): SdlcColumn {
  return agentColumn(id, label, NEW_AGENT_COLUMN_PROMPT)
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

export function isAgentColumn(column: SdlcColumn | null | undefined): boolean {
  return column?.kind === 'agent'
}

/** The ends are structural: the first column is where tickets have no worktree yet, the last is where it is gone. */
export function isMiddleColumn(columns: readonly SdlcColumn[], index: number): boolean {
  return index > 0 && index < columns.length - 1
}

/** Columns whose output a prompt in `id` may read: only the agent columns before it have run by then. */
export function earlierAgentColumns(columns: readonly SdlcColumn[], id: string): SdlcColumn[] {
  const index = columns.findIndex((c) => c.id === id)
  return columns.slice(0, Math.max(index, 0)).filter(isAgentColumn)
}

const COLUMN_KINDS: readonly SdlcColumnKind[] = ['human', 'agent', 'terminal']

/** Flows saved before columns had a command carried an "unattended" switch instead, which the command now spells out. */
function storedCommand(raw: Partial<SdlcColumn> & { autonomous?: unknown }): string {
  if (typeof raw.command === 'string') return raw.command
  if (raw.kind !== 'agent') return ''
  return raw.autonomous === false ? ATTENDED_AGENT_COMMAND : DEFAULT_AGENT_COMMAND
}

function sanitizeColumn(value: unknown): SdlcColumn | null {
  const raw = (value ?? {}) as Partial<SdlcColumn> & { autonomous?: unknown }
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (!COLUMN_KINDS.includes(raw.kind as SdlcColumnKind)) return null
  return {
    id: raw.id,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : raw.id,
    kind: raw.kind as SdlcColumnKind,
    command: storedCommand(raw),
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    outputFile: typeof raw.outputFile === 'string' && raw.outputFile.trim() ? raw.outputFile.trim() : null
  }
}

/**
 * The rest of the board leans on three invariants, so stored flows are forced
 * back into them rather than trusted: ids are unique, the first column is a
 * human one (no worktree exists yet) and exactly the last one is terminal.
 * Every column between runs an agent: tickets flow on by themselves, so a
 * human column there would be a dead end nothing moves a ticket out of.
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
    if (column.kind === 'agent') return column
    return {
      ...column,
      kind: 'agent',
      command: column.command || DEFAULT_AGENT_COMMAND,
      prompt: column.prompt || NEW_AGENT_COLUMN_PROMPT
    }
  })
}
