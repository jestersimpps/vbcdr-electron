import { SENTINEL_CLAUSE } from '@/models/sdlc-prompts'

/** Human: the ticket waits. Agent: entering hands the column's prompt to a CLI agent. Terminal: the ticket ends and its worktree is gone. */
export type SdlcColumnKind = 'human' | 'agent' | 'terminal'

export interface SdlcColumn {
  id: string
  label: string
  kind: SdlcColumnKind
  /** The CLI an agent column, or the last column's on-demand prompt, starts in the ticket's worktree. Empty runs the default LLM tab. */
  command: string
  prompt: string
  /** Also keep the output as a document in the worktree, for later columns' agents to open. */
  outputFile: string | null
}

/** A saved flow: projects pick one, and editing it changes the board of every project that uses it. */
export interface SdlcFlow {
  id: string
  name: string
  columns: SdlcColumn[]
}

/** The flow every project uses until it picks another. It always exists, so it cannot be deleted. */
export const DEFAULT_FLOW_ID = 'default'

/** A column runs in a fresh worktree whose gitignored settings never carry the project's permission mode, so it would stop on its first tool call. */
export const DEFAULT_AGENT_COMMAND = 'claude --permission-mode bypassPermissions'

const ATTENDED_AGENT_COMMAND = 'claude'

const NEW_COLUMN_TASK = "Describe here what this column's agent should do and what it should report."

const BUILD_TASK = `Implement the ticket. Match the conventions of the surrounding code. When the code is complete, run the project's typecheck, lint and tests, and fix what you broke. Commit your work on this branch with clear messages, but do not push and do not open a pull request. Report what you changed and the final state of the checks.`

/** The last column finishes a ticket off: nothing waits for it, so it writes no result file. */
export const DONE_COLUMN_PROMPT = `Work on this ticket in the worktree at {{worktreePath}} on branch {{branch}}. The main checkout is at {{projectPath}}: do not change anything there.

Title: {{title}}
Description:
{{description}}

Pull request for this branch: {{pr}}

If there is no pull request yet:
1. Commit anything still uncommitted with a clear message that describes the change.
2. Push the branch to origin and open a pull request against master with the GitHub CLI (\`gh pr create --base master\`), with a title and body written from the ticket and the changes.

If the pull request already exists:
1. Fetch origin and check whether the branch is behind master. If it is, rebase it onto origin/master and resolve every conflict, keeping the intent of both sides.
2. Run the project's typecheck, lint and tests, and fix anything the rebase broke.
3. Push the result to the pull request with \`git push --force-with-lease\`.

Do not merge the pull request. Finish by printing its URL.`

function earlierOutputSections(earlier: readonly SdlcColumn[]): string[] {
  return earlier.map((c) => `Result of ${c.label}:\n{{output.${c.id}}}\n`)
}

/**
 * Hands the agent everything the handover carries: the ticket, where it lives,
 * what earlier agent columns reported and what is already committed on the branch.
 */
export function columnPrompt(earlier: readonly SdlcColumn[], task: string = NEW_COLUMN_TASK): string {
  return [
    'Work on this ticket in the worktree at {{worktreePath}} on branch {{branch}}. The main checkout is at {{projectPath}}: do not change anything there.',
    '',
    'Title: {{title}}',
    'Description:',
    '{{description}}',
    '',
    ...earlierOutputSections(earlier),
    'Changes committed on this branch so far:',
    '{{diff}}',
    '',
    task,
    '',
    SENTINEL_CLAUSE
  ].join('\n')
}



function agentColumn(id: string, label: string, prompt: string): SdlcColumn {
  return { id, label, kind: 'agent', command: DEFAULT_AGENT_COMMAND, prompt, outputFile: null }
}

export function defaultSdlcColumns(): SdlcColumn[] {
  const build = agentColumn('build', 'Build', columnPrompt([], BUILD_TASK))
  return [
    { id: 'backlog', label: 'Backlog', kind: 'human', command: '', prompt: '', outputFile: null },
    build,
    { ...build, id: 'done', label: 'Done', kind: 'terminal', prompt: DONE_COLUMN_PROMPT }
  ]
}

export function defaultSdlcFlow(): SdlcFlow {
  return { id: DEFAULT_FLOW_ID, name: 'Default', columns: defaultSdlcColumns() }
}

/** `earlier` is the agent columns to its left, whose results the new column's prompt reads. */
export function newAgentColumn(id: string, label: string, earlier: readonly SdlcColumn[]): SdlcColumn {
  return agentColumn(id, label, columnPrompt(earlier))
}

/** What "reset" means for a column's prompt: the pull-request prompt for the last column, the shipped Build prompt, or the template for its place. */
export function defaultColumnPrompt(columns: readonly SdlcColumn[], id: string): string {
  const earlier = earlierAgentColumns(columns, id)
  if (findColumn(columns, id)?.kind === 'terminal') return DONE_COLUMN_PROMPT
  if (id === 'build') return columnPrompt(earlier, BUILD_TASK)
  return columnPrompt(earlier)
}

/** Every column but the first starts a CLI: the middle ones as tickets arrive, the last one on demand. */
export function hasCommand(column: SdlcColumn): boolean {
  return column.kind !== 'human'
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
  if (raw.kind === 'human') return ''
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
  const shaped = columns.map((column, index): SdlcColumn => {
    if (index === 0) return { ...column, kind: 'human' }
    if (index === last) return { ...column, kind: 'terminal' }
    if (column.kind === 'agent') return column
    return { ...column, kind: 'agent', command: column.command || DEFAULT_AGENT_COMMAND }
  })
  return shaped.map((column) =>
    hasCommand(column) && !column.prompt
      ? {
          ...column,
          command: column.command || DEFAULT_AGENT_COMMAND,
          prompt: defaultColumnPrompt(shaped, column.id)
        }
      : column
  )
}

function sanitizeFlow(value: unknown): SdlcFlow | null {
  const raw = (value ?? {}) as Partial<SdlcFlow>
  if (typeof raw.id !== 'string' || !raw.id) return null
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : raw.id,
    columns: sanitizeColumns(raw.columns)
  }
}

/** The default flow is what a project without a choice falls back to, so a stored list without it gets it back first. */
export function sanitizeFlows(value: unknown): SdlcFlow[] {
  const seen = new Set<string>()
  const flows = (Array.isArray(value) ? value : [])
    .map(sanitizeFlow)
    .filter((f): f is SdlcFlow => f !== null)
    .filter((f) => (seen.has(f.id) ? false : !!seen.add(f.id)))
  const fallback = flows.find((f) => f.id === DEFAULT_FLOW_ID) ?? defaultSdlcFlow()
  return [fallback, ...flows.filter((f) => f.id !== DEFAULT_FLOW_ID)]
}

export function findFlow(flows: readonly SdlcFlow[], id: string): SdlcFlow | undefined {
  return flows.find((f) => f.id === id)
}
