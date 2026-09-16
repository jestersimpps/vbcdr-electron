import { useSdlcStore } from '@/stores/sdlc-store'
import { defaultLlmTab, useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useLayoutStore } from '@/stores/layout-store'
import { createWorktreeForProject, toWorktreeInfo, useWorktreeStore } from '@/stores/worktree-store'
import { resolveStagePrompt } from '@/stores/sdlc-prompts-store'
import { interpolatePrompt, type SdlcPromptVariables } from '@/lib/llm-instructions'
import { clearSentinel, readSentinel } from '@/lib/sdlc-sentinel'
import { attachmentsInstruction, writeAttachmentsToWorktree } from '@/lib/sdlc-attachments'
import { sendToTerminalViaPty } from '@/lib/send-to-terminal'
import { deleteWorktree } from '@/lib/worktree-tabs'
import { disposeTerminal } from '@/components/terminal/TerminalInstance'
import {
  EMPTY_PROMPT_VALUE,
  SDLC_PLAN_RELATIVE,
  SDLC_SENTINEL_DIR,
  SENTINEL_CLAUSE,
  isHandoffStage,
  type SdlcHandoffStage
} from '@/models/sdlc-prompts'
import { SDLC_STAGES, nextStage, type SdlcAttachment, type SdlcTicket } from '@/models/sdlc'
import { SDLC_PROFILE_ID, type TabProfileMeta } from '@/config/terminal-profiles'
import { LLM_PROVIDERS, appendCompanionPrompt, type LlmProviderId } from '@/config/llm-provider-registry'
import type { Project, TrackedWorktree, WorktreeInfo } from '@/models/types'

export const SDLC_TAB_COLOR = '#2dd4bf'

export interface StageHandoverResult {
  tabId: string
  worktree: WorktreeInfo
}

export function stageLabel(stage: SdlcHandoffStage): string {
  return SDLC_STAGES.find((s) => s.id === stage)?.label ?? stage
}

export function sdlcProfileMeta(stage: SdlcHandoffStage, ticket: SdlcTicket, providerId: LlmProviderId): TabProfileMeta {
  return {
    profileId: SDLC_PROFILE_ID,
    providerId,
    label: `${stageLabel(stage)} · ${ticket.title}`,
    color: SDLC_TAB_COLOR
  }
}

const RESUME_FLAG: Partial<Record<LlmProviderId, string>> = { claude: '--continue' }

/**
 * A stage runs in a fresh worktree, and `.claude/settings.local.json` is
 * gitignored, so the project's own permission mode never reaches the agent and
 * it would stop for an approval prompt on its first tool call. Handed-off
 * stages are unattended by definition, so the mode is set on the command line.
 */
const AUTONOMOUS_FLAG: Partial<Record<LlmProviderId, string>> = {
  claude: '--permission-mode bypassPermissions'
}

interface StageCommand {
  command: string
  providerId: LlmProviderId
}

function withResume(command: string, providerId: LlmProviderId): string {
  const flag = RESUME_FLAG[providerId]
  return flag ? command.replace(/^(\S+)/, `$1 ${flag}`) : command
}

function withAutonomy(command: string, providerId: LlmProviderId): string {
  const flag = AUTONOMOUS_FLAG[providerId]
  if (!flag || command.includes('--permission-mode')) return command
  return command.replace(/^(\S+)/, `$1 ${flag}`)
}

/**
 * The stage's picked model decides which CLI runs and its --model flag; a stage
 * with nothing picked runs the default profile exactly as a manual tab would.
 * Sessions live per working directory, so resuming is just the CLI's own
 * "continue the latest session here" flag inside the ticket's worktree.
 */
function stageCommand(stage: SdlcHandoffStage, resume: boolean): StageCommand {
  const assignment = useSdlcStore.getState().stageModels[stage]
  const layout = useLayoutStore.getState()
  let base: StageCommand
  if (assignment) {
    const providerId: LlmProviderId = assignment.provider === 'openai' ? 'codex' : 'claude'
    const parts = [LLM_PROVIDERS[providerId].command]
    if (assignment.model) parts.push('--model', assignment.model)
    const promptPath = layout.companionEnabled ? layout.companionPromptPath : null
    base = { command: appendCompanionPrompt(parts.join(' '), providerId, promptPath), providerId }
  } else {
    const { command, profile } = defaultLlmTab()
    base = { command, providerId: profile?.providerId ?? layout.llmProviderId }
  }
  const autonomous = { ...base, command: withAutonomy(base.command, base.providerId) }
  return resume
    ? { ...autonomous, command: withResume(autonomous.command, autonomous.providerId) }
    : autonomous
}

export function canResumeStage(stage: SdlcHandoffStage): boolean {
  return !!RESUME_FLAG[stageCommand(stage, false).providerId]
}

function activityEntry(ticket: SdlcTicket, text: string): SdlcTicket['artifacts'] {
  return { ...ticket.artifacts, activity: [...ticket.artifacts.activity, { at: Date.now(), text }] }
}

/**
 * Tracked state is in-memory and empty after a reload, so an existing worktree
 * is confirmed through main rather than the store's list.
 */
async function ensureTicketWorktree(ticket: SdlcTicket, project: Project): Promise<WorktreeInfo | null> {
  if (ticket.worktreeId) {
    const tracked = await useWorktreeStore.getState().refreshOne(ticket.worktreeId)
    if (tracked) return toWorktreeInfo(tracked)
  }
  const tracked: TrackedWorktree[] = await window.api.worktrees.list(project.id)
  const onBranch = tracked.find((w) => w.branch === ticket.branch)
  if (onBranch) return toWorktreeInfo(onBranch)
  const created = await createWorktreeForProject(project.id, project.path)
  if (!created) return null
  const renameError = await useWorktreeStore.getState().renameBranch(created.id, ticket.branch)
  return renameError ? created : { ...created, branch: ticket.branch }
}

function promptVariables(
  ticket: SdlcTicket,
  project: Project,
  worktree: WorktreeInfo,
  diff: string
): SdlcPromptVariables {
  return {
    title: ticket.title || EMPTY_PROMPT_VALUE,
    description: ticket.description || EMPTY_PROMPT_VALUE,
    branch: worktree.branch,
    worktreePath: worktree.path,
    projectPath: project.path,
    plan: ticket.artifacts.plan || EMPTY_PROMPT_VALUE,
    diff: diff || EMPTY_PROMPT_VALUE
  }
}

/**
 * Marks the tab as the project's active one so the queue runner drains it,
 * without touching which page or panel is on screen. Used for handoffs kicked
 * off from the SDLC board, which should stay on the board.
 */
function activateTab(projectId: string, tabId: string): void {
  useTerminalStore.getState().setActiveTab(projectId, tabId)
}

/** Leaves whatever page is open and lands on the tab; for the user explicitly asking to see it. */
function focusTab(projectId: string, tabId: string): void {
  useProjectStore.getState().setActiveProject(projectId)
  activateTab(projectId, tabId)
  useEditorStore.getState().setCenterTab(projectId, 'terminals')
}

export function focusTicketTab(ticket: SdlcTicket): boolean {
  const { tabId } = ticket
  if (!tabId || !useTerminalStore.getState().tabs.some((t) => t.id === tabId)) return false
  focusTab(ticket.projectId, tabId)
  return true
}

async function diffForReview(worktree: WorktreeInfo, project: Project): Promise<string> {
  const base = await window.api.git.defaultBranch(project.path)
  return window.api.git.diffSummary(worktree.path, base)
}

export async function handOffStage(
  ticket: SdlcTicket,
  project: Project,
  note?: string
): Promise<StageHandoverResult | null> {
  if (!isHandoffStage(ticket.stage)) return null
  const stage = ticket.stage
  const { patchTicket } = useSdlcStore.getState()

  const worktree = await ensureTicketWorktree(ticket, project)
  if (!worktree) {
    patchTicket(ticket.id, {
      status: 'failed',
      blockedReason: 'Not a git repository. A ticket needs a worktree to hand off.'
    })
    return null
  }

  const worktreeFields = { worktreeId: worktree.id, worktreePath: worktree.path, branch: worktree.branch }

  let prompt: string
  try {
    await window.api.git.ensureInfoExclude(project.path, `${SDLC_SENTINEL_DIR}/`)
    await clearSentinel(worktree.path)
    const diff = stage === 'review' ? await diffForReview(worktree, project) : ''
    prompt = interpolatePrompt(
      resolveStagePrompt(project.id, stage).text,
      promptVariables(ticket, project, worktree, diff)
    )
    const attached = await writeAttachmentsToWorktree(worktree.path, ticket.attachments)
    if (attached.length > 0) prompt = `${prompt}\n\n${attachmentsInstruction(attached)}`
    if (note?.trim()) prompt = `${prompt}\n\n${note.trim()}`
  } catch (err) {
    patchTicket(ticket.id, {
      ...worktreeFields,
      status: 'failed',
      blockedReason: `Handoff failed: ${err instanceof Error ? err.message : String(err)}`
    })
    return null
  }

  const { command, providerId } = stageCommand(stage, false)
  const tabId = useTerminalStore
    .getState()
    .createTab(project.id, worktree.path, command, worktree, sdlcProfileMeta(stage, ticket, providerId))
  useQueueStore.getState().addItem(tabId, prompt)
  activateTab(project.id, tabId)

  patchTicket(ticket.id, {
    ...worktreeFields,
    tabId,
    status: 'running',
    blockedReason: null,
    artifacts: activityEntry(ticket, `Handed ${stageLabel(stage)} to the agent`)
  })
  return { tabId, worktree }
}

function mergePrompt(target: string, branch: string, worktreePath: string): string {
  return [
    `Bring branch ${branch} up to date with ${target} in the worktree at ${worktreePath}.`,
    '',
    `Run \`git merge ${target}\` on this branch. If it conflicts, resolve every conflict:`,
    'read both sides, keep the intent of each change rather than blindly taking one side,',
    'and remove all conflict markers. Do not merge this branch into ' + target + ' —',
    'the merge goes the other way, so the main checkout is never touched.',
    '',
    "When the tree is clean, run the project's typecheck, lint and tests, and fix anything",
    'the merge broke. Commit the merge on this branch. Do not push and do not open a pull request.',
    '',
    `If ${target} does not exist or there is nothing to merge, say so and stop.`,
    '',
    SENTINEL_CLAUSE
  ].join('\n')
}

/**
 * Merges the target branch INTO the ticket's branch, inside the ticket's own
 * worktree: conflicts get resolved on the disposable side, so the user's real
 * checkout is never left mid-merge. Fast-forwarding the target onto the result
 * stays a human/PR step.
 */
export async function mergeIntoTicketBranch(ticketId: string, target: string): Promise<boolean> {
  const store = useSdlcStore.getState()
  const ticket = store.tickets.find((t) => t.id === ticketId)
  if (!ticket || ticket.worktreePath === '—') return false
  const project = findProject(ticket)
  if (!project) return false
  const cleanTarget = target.trim()
  if (!cleanTarget) return false

  const worktree = await ensureTicketWorktree(ticket, project)
  if (!worktree) return false

  try {
    await window.api.git.ensureInfoExclude(project.path, `${SDLC_SENTINEL_DIR}/`)
    await clearSentinel(worktree.path)
  } catch {
    return false
  }

  await closeTicketTab(ticket)

  const { command, providerId } = stageCommand('implementing', false)
  const tabId = useTerminalStore
    .getState()
    .createTab(project.id, worktree.path, command, worktree, sdlcProfileMeta(ticket.stage, ticket, providerId))
  useQueueStore.getState().addItem(tabId, mergePrompt(cleanTarget, worktree.branch, worktree.path))
  activateTab(project.id, tabId)

  store.patchTicket(ticket.id, {
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    branch: worktree.branch,
    tabId,
    status: 'running',
    blockedReason: null,
    artifacts: activityEntry(ticket, `Merging ${cleanTarget} into ${worktree.branch}`)
  })
  return true
}

/**
 * Adding an attachment while the agent is live behaves like pasting into
 * Claude Code: the files land in the worktree and the agent is told where.
 */
export async function sendAttachmentsToAgent(ticket: SdlcTicket, attachments: SdlcAttachment[]): Promise<boolean> {
  if (!ticket.tabId || ticket.worktreePath === '—') return false
  if (!useTerminalStore.getState().tabs.some((t) => t.id === ticket.tabId)) return false
  const written = await writeAttachmentsToWorktree(ticket.worktreePath, attachments)
  if (written.length === 0) return false
  sendToTerminalViaPty(ticket.tabId, attachmentsInstruction(written))
  useSdlcStore.getState().patchTicket(ticket.id, {
    artifacts: activityEntry(ticket, `Sent ${written.length} attachment${written.length === 1 ? '' : 's'} to the agent`)
  })
  return true
}

export async function closeTicketTab(ticket: SdlcTicket): Promise<void> {
  const { tabId } = ticket
  if (!tabId) return
  await window.api.terminal.kill(tabId)
  disposeTerminal(tabId)
  useTerminalStore.getState().closeTab(tabId)
  useQueueStore.getState().clearTab(tabId)
  useSdlcStore.getState().patchTicket(ticket.id, { tabId: null })
}

export function applyStageOutput(ticket: SdlcTicket, output: string): Partial<SdlcTicket> {
  switch (ticket.stage) {
    case 'planning':
      return { artifacts: { ...ticket.artifacts, plan: output } }
    case 'implementing':
      return { artifacts: { ...ticket.artifacts, checkOutput: output } }
    case 'review':
      return { artifacts: { ...ticket.artifacts, prSummary: output } }
    default:
      return {}
  }
}

/** The advance gate: a stage may only hand on once the agent's output for it exists. Backlog has no agent step. */
export function stageOutputReady(ticket: SdlcTicket): boolean {
  switch (ticket.stage) {
    case 'planning':
      return !!ticket.artifacts.plan
    case 'implementing':
      return !!ticket.artifacts.checkOutput
    case 'review':
      return !!ticket.artifacts.prSummary
    default:
      return true
  }
}

/**
 * Applies the sentinel to the ticket and keeps the plan as a document in the
 * worktree, so the implementing agent can open it rather than only see it inlined.
 */
export async function recordStageOutput(ticket: SdlcTicket, output: string): Promise<Partial<SdlcTicket>> {
  const patch = applyStageOutput(ticket, output)
  if (ticket.stage === 'planning' && ticket.worktreePath !== '—') {
    await window.api.fs.writeFile(`${ticket.worktreePath}/${SDLC_PLAN_RELATIVE}`, output)
  }
  return patch
}

/** Re-reads the sentinel so an Advance pressed before the watcher's next tick still captures the output. */
export async function captureStageOutput(ticket: SdlcTicket): Promise<SdlcTicket> {
  if (ticket.worktreePath === '—') return ticket
  const output = await readSentinel(ticket.worktreePath)
  if (!output) return ticket
  const patch = await recordStageOutput(ticket, output)
  useSdlcStore.getState().patchTicket(ticket.id, patch)
  return { ...ticket, ...patch }
}

function findProject(ticket: SdlcTicket): Project | undefined {
  return useProjectStore.getState().projects.find((p) => p.id === ticket.projectId)
}

/** The human's Advance: capture, close the finished tab, then hand the next stage to a fresh one. */
export async function advanceAndHandOff(ticketId: string): Promise<void> {
  const store = useSdlcStore.getState()
  const current = store.tickets.find((t) => t.id === ticketId)
  if (!current) return
  const project = findProject(current)
  if (!project) return

  const captured = await captureStageOutput(current)
  const next = nextStage(captured.stage)
  if (!next || next === 'done') return

  await closeTicketTab(captured)

  store.advanceTicket(ticketId)
  const advanced = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!advanced) return
  await handOffStage(advanced, project)
}

/**
 * An auto-advancing ticket takes the same route a human would click, so review
 * output is still captured and worktrees are still cleaned up. Only invoked for
 * a stage that has written its sentinel, and never for one whose agent is
 * blocked or failed — those still need a person.
 */
export async function autoAdvanceTicket(ticketId: string): Promise<void> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket || !ticket.autoAdvance) return
  if (ticket.stage === 'review') {
    await finishTicket(ticketId)
    return
  }
  await advanceAndHandOff(ticketId)
}

/** Picks the ticket's last session back up in a fresh tab: no prompt is re-sent, the session already has it. */
export async function resumeStage(ticketId: string): Promise<boolean> {
  const store = useSdlcStore.getState()
  const ticket = store.tickets.find((t) => t.id === ticketId)
  if (!ticket || !isHandoffStage(ticket.stage) || !ticket.worktreeId) return false
  const project = findProject(ticket)
  if (!project) return false
  const { command, providerId } = stageCommand(ticket.stage, true)
  if (!RESUME_FLAG[providerId]) return false
  const worktree = await ensureTicketWorktree(ticket, project)
  if (!worktree) return false

  await closeTicketTab(ticket)
  const tabId = useTerminalStore
    .getState()
    .createTab(project.id, worktree.path, command, worktree, sdlcProfileMeta(ticket.stage, ticket, providerId))
  activateTab(project.id, tabId)
  store.patchTicket(ticket.id, {
    tabId,
    status: 'running',
    blockedReason: null,
    artifacts: activityEntry(ticket, `Resumed the ${stageLabel(ticket.stage)} session`)
  })
  return true
}

/** Fires the current stage again in a fresh tab, without moving the ticket. */
export async function rerunStage(ticketId: string): Promise<void> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket) return
  const project = findProject(ticket)
  if (!project) return
  await closeTicketTab(ticket)
  await handOffStage(ticket, project)
}

/**
 * Refining is feedback aimed at the agent, not just a note: if the stage is
 * still live, it's pasted straight into that session; otherwise the stage is
 * rerun from scratch with the note folded into the fresh prompt.
 */
export async function refineTicket(ticketId: string, note: string): Promise<boolean> {
  if (!note.trim()) return false
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket) return false

  if (ticket.tabId && useTerminalStore.getState().tabs.some((t) => t.id === ticket.tabId)) {
    sendToTerminalViaPty(ticket.tabId, note)
    useSdlcStore.getState().patchTicket(ticket.id, {
      artifacts: activityEntry(ticket, 'Sent a refinement to the agent')
    })
    return true
  }

  const project = findProject(ticket)
  if (!project) return false
  await closeTicketTab(ticket)
  const result = await handOffStage(ticket, project, note)
  return !!result
}

/** Removes the ticket with everything it owns: the agent tab, the worktree and its branch. */
export async function discardTicket(ticketId: string): Promise<void> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket) return
  if (ticket.worktreeId) {
    await deleteWorktree(ticket.worktreeId)
  } else {
    await closeTicketTab(ticket)
  }
  useSdlcStore.getState().deleteTicket(ticketId)
}

/**
 * Finishing deletes the branch as well as the worktree, so commits that exist
 * nowhere else would survive only as unreachable objects. Returns the commit
 * subjects that would be lost, for the caller to confirm first.
 */
export async function unmergedCommits(ticketId: string): Promise<string[]> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket || ticket.worktreePath === '—') return []
  const project = findProject(ticket)
  if (!project) return []
  try {
    const target = await window.api.git.defaultBranch(project.path)
    const summary = await window.api.git.diffSummary(ticket.worktreePath, target)
    const commits = summary.split('\n\nChanges:')[0].replace(/^Commits:\n?/, '').trim()
    return commits ? commits.split('\n').filter((l) => l.trim()) : []
  } catch {
    return []
  }
}

/** Review → done, after the close-tab workflow has pushed and opened the PR. */
export async function finishTicket(ticketId: string): Promise<void> {
  const store = useSdlcStore.getState()
  const ticket = store.tickets.find((t) => t.id === ticketId)
  if (!ticket || ticket.stage !== 'review') return
  const captured = await captureStageOutput(ticket)
  if (captured.worktreeId) {
    await deleteWorktree(captured.worktreeId)
  } else {
    await closeTicketTab(captured)
  }
  store.patchTicket(ticketId, {
    tabId: null,
    artifacts: activityEntry(captured, 'Worktree removed')
  })
  store.advanceTicket(ticketId)
}
