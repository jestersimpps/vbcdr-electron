import { titleFromDescription, useSdlcStore } from '@/stores/sdlc-store'
import { defaultLlmTab, useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useLayoutStore } from '@/stores/layout-store'
import { createTrackedWorktreeForProject, toWorktreeInfo, useWorktreeStore } from '@/stores/worktree-store'
import { resolveStagePrompt } from '@/stores/sdlc-prompts-store'
import { sdlcColumns } from '@/stores/sdlc-flow-store'
import { interpolatePrompt, prPromptValue, promptUsesVariable, type SdlcPromptVariables } from '@/lib/llm-instructions'
import { clearSentinel, readSentinel } from '@/lib/sdlc-sentinel'
import { attachmentsInstruction, writeAttachmentsToWorktree } from '@/lib/sdlc-attachments'
import { deleteWorktree, finishWorktree } from '@/lib/worktree-tabs'
import { disposeTerminal } from '@/components/terminal/TerminalInstance'
import { EMPTY_PROMPT_VALUE, SDLC_SENTINEL_DIR, SENTINEL_CLAUSE } from '@/models/sdlc-prompts'
import { DONE_OUTCOME_LABELS, DONE_REPORT_CLAUSE, resolveDoneOutcome } from '@/models/sdlc-done-outcome'
import { findColumn, isAgentColumn, nextColumn, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcDoneTrigger, SdlcStage, SdlcTicket } from '@/models/sdlc'
import { SDLC_PROFILE_ID, type TabProfileMeta } from '@/config/terminal-profiles'
import { providerIdForCommand, type LlmProviderId } from '@/config/llm-provider-registry'
import type { Project, TrackedWorktree, WorktreeBase, WorktreeInfo } from '@/models/types'

export const SDLC_TAB_COLOR = '#2dd4bf'

export interface StageHandoverResult {
  tabId: string
  worktree: WorktreeInfo
}

export function ticketColumn(ticket: SdlcTicket): SdlcColumn | undefined {
  return findColumn(sdlcColumns(ticket.projectId), ticket.stage)
}

export function stageLabel(ticket: SdlcTicket, stage: SdlcStage = ticket.stage): string {
  return findColumn(sdlcColumns(ticket.projectId), stage)?.label ?? stage
}

export function sdlcProfileMeta(stage: SdlcStage, ticket: SdlcTicket, providerId: LlmProviderId): TabProfileMeta {
  return {
    profileId: SDLC_PROFILE_ID,
    providerId,
    label: `${stageLabel(ticket, stage)} · ${ticket.title}`,
    color: SDLC_TAB_COLOR
  }
}

interface StageCommand {
  command: string
  providerId: LlmProviderId
}

/** Flags follow the binary, so the provider is read from the command's first word. */
function providerOf(command: string): LlmProviderId {
  return providerIdForCommand(command.trim().split(/\s+/)[0] ?? '')
}

/** The column's startup command runs as typed; a column without one runs the default profile exactly as a manual tab would. */
function stageCommand(ticket: SdlcTicket): StageCommand {
  const configured = ticketColumn(ticket)?.command.trim()
  const layout = useLayoutStore.getState()
  if (!configured) {
    const { command, profile } = defaultLlmTab()
    return { command, providerId: profile?.providerId ?? layout.llmProviderId }
  }
  return { command: configured, providerId: providerOf(configured) }
}

function activityEntry(ticket: SdlcTicket, text: string): SdlcTicket['artifacts'] {
  return { ...ticket.artifacts, activity: [...ticket.artifacts.activity, { at: Date.now(), text }] }
}

function currentTicket(ticket: SdlcTicket): SdlcTicket {
  return useSdlcStore.getState().tickets.find((t) => t.id === ticket.id) ?? ticket
}

function worktreeCreatedText(base: WorktreeBase | null | undefined): string {
  if (!base) return 'Worktree created'
  if (!base.syncError) return `Worktree created from the latest ${base.ref}`
  return `Worktree created from local ${base.ref}, pulling failed: ${base.syncError.split('\n')[0]}`
}

/** A ticket deleted while its worktree was still being created would otherwise leave that worktree behind. */
async function createTicketWorktree(ticket: SdlcTicket, project: Project): Promise<WorktreeInfo | null> {
  const created = await createTrackedWorktreeForProject(project.id, project.path, { fromLatestDefault: true })
  if (!created) return null
  const renameError = await useWorktreeStore.getState().renameBranch(created.id, ticket.branch)
  const worktree = toWorktreeInfo(renameError ? created : { ...created, branch: ticket.branch })
  const { tickets, patchTicket } = useSdlcStore.getState()
  if (!tickets.some((t) => t.id === ticket.id)) {
    await deleteWorktree(created.id)
    return null
  }
  patchTicket(ticket.id, {
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    branch: worktree.branch,
    artifacts: activityEntry(currentTicket(ticket), worktreeCreatedText(created.base))
  })
  return worktree
}

/**
 * Tracked state is in-memory and empty after a reload, so an existing worktree
 * is confirmed through main rather than the store's list.
 */
async function resolveTicketWorktree(ticket: SdlcTicket, project: Project): Promise<WorktreeInfo | null> {
  if (ticket.worktreeId) {
    const tracked = await useWorktreeStore.getState().refreshOne(ticket.worktreeId)
    if (tracked) return toWorktreeInfo(tracked)
  }
  const tracked: TrackedWorktree[] = await window.api.worktrees.list(project.id)
  const onBranch = tracked.find((w) => w.branch === ticket.branch)
  if (onBranch) return toWorktreeInfo(onBranch)
  return createTicketWorktree(ticket, project)
}

const pendingWorktrees = new Map<string, Promise<WorktreeInfo | null>>()

/** Creation pulls first and can take seconds, so a Start pressed meanwhile joins the running creation instead of making a second worktree. */
function ensureTicketWorktree(ticket: SdlcTicket, project: Project): Promise<WorktreeInfo | null> {
  const pending = pendingWorktrees.get(ticket.id)
  if (pending) return pending
  const resolving = resolveTicketWorktree(currentTicket(ticket), project).finally(() =>
    pendingWorktrees.delete(ticket.id)
  )
  pendingWorktrees.set(ticket.id, resolving)
  return resolving
}

function promptVariables(
  ticket: SdlcTicket,
  project: Project,
  worktree: WorktreeInfo,
  diff: string,
  pr: string
): SdlcPromptVariables {
  return {
    title: ticket.title || EMPTY_PROMPT_VALUE,
    description: ticket.description || EMPTY_PROMPT_VALUE,
    branch: worktree.branch,
    worktreePath: worktree.path,
    projectPath: project.path,
    diff: diff || EMPTY_PROMPT_VALUE,
    pr: pr || EMPTY_PROMPT_VALUE,
    outputs: Object.fromEntries(
      sdlcColumns(ticket.projectId).map((c) => [c.id, ticket.artifacts.outputs[c.id] || EMPTY_PROMPT_VALUE])
    )
  }
}

/**
 * Makes the ticket's project current and the tab its active one so the queue
 * runner drains it, without touching which page is on screen. Terminals only
 * mount for the current project, so a ticket in another project would never
 * get a pty. Used for handoffs kicked off from the SDLC board, which should
 * stay on the board.
 */
function activateTab(projectId: string, tabId: string): void {
  useProjectStore.setState({ activeProjectId: projectId })
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

/** Asks gh at handoff time, since the tracked PR state is only as fresh as the last worktree refresh; a found PR lands on the card. */
async function prForPrompt(ticket: SdlcTicket, worktree: WorktreeInfo): Promise<string> {
  const tracked = await useWorktreeStore.getState().refreshOne(worktree.id)
  if (!tracked) return prPromptValue('unknown', null)
  if (tracked.prUrl) useSdlcStore.getState().patchTicket(ticket.id, { prUrl: tracked.prUrl, prState: tracked.prState })
  return prPromptValue(tracked.prState, tracked.prUrl)
}

/** A fresh tab for the ticket's column, with the prompt queued for once the CLI is up, made the tab the queue runner drains. */
function openColumnTab(ticket: SdlcTicket, project: Project, worktree: WorktreeInfo, prompt: string): string {
  const { command, providerId } = stageCommand(ticket)
  const tabId = useTerminalStore
    .getState()
    .createTab(project.id, worktree.path, command, worktree, sdlcProfileMeta(ticket.stage, ticket, providerId))
  useQueueStore.getState().addItem(tabId, prompt)
  activateTab(project.id, tabId)
  return tabId
}

async function renderPrompt(template: string, ticket: SdlcTicket, project: Project, worktree: WorktreeInfo): Promise<string> {
  const diff = promptUsesVariable(template, 'diff') ? await diffForReview(worktree, project) : ''
  const pr = promptUsesVariable(template, 'pr') ? await prForPrompt(ticket, worktree) : ''
  return interpolatePrompt(template, promptVariables(ticket, project, worktree, diff, pr))
}

export async function handOffStage(ticket: SdlcTicket, project: Project): Promise<StageHandoverResult | null> {
  if (!isAgentColumn(ticketColumn(ticket))) return null
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
    prompt = await renderPrompt(resolveStagePrompt(project.id, stage).text, ticket, project, worktree)
    const attached = await writeAttachmentsToWorktree(worktree.path, ticket.attachments)
    if (attached.length > 0) prompt = `${prompt}\n\n${attachmentsInstruction(attached)}`
  } catch (err) {
    patchTicket(ticket.id, {
      ...worktreeFields,
      status: 'failed',
      blockedReason: `Handoff failed: ${err instanceof Error ? err.message : String(err)}`
    })
    return null
  }

  const tabId = openColumnTab(ticket, project, worktree, prompt)

  patchTicket(ticket.id, {
    ...worktreeFields,
    tabId,
    status: 'running',
    blockedReason: null,
    artifacts: activityEntry(currentTicket(ticket), `Handed ${stageLabel(ticket, stage)} to the agent`)
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

  const tabId = openColumnTab(ticket, project, worktree, mergePrompt(cleanTarget, worktree.branch, worktree.path))

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
  if (!isAgentColumn(ticketColumn(ticket))) return {}
  return { artifacts: { ...ticket.artifacts, outputs: { ...ticket.artifacts.outputs, [ticket.stage]: output } } }
}

/**
 * Applies the sentinel to the ticket and, where the column asks for it, keeps
 * the output as a document in the worktree, so a later agent can open it rather
 * than only see it inlined.
 */
export async function recordStageOutput(ticket: SdlcTicket, output: string): Promise<Partial<SdlcTicket>> {
  const patch = applyStageOutput(ticket, output)
  const outputFile = ticketColumn(ticket)?.outputFile
  if (outputFile && ticket.worktreePath !== '—') {
    await window.api.fs.writeFile(`${ticket.worktreePath}/${outputFile}`, output)
  }
  return patch
}

/** Re-reads the sentinel so a move pressed before the watcher's next tick still captures the output. */
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

/** Capture, close the finished tab, then hand the next stage to a fresh one. */
export async function advanceAndHandOff(ticketId: string): Promise<void> {
  const store = useSdlcStore.getState()
  const current = store.tickets.find((t) => t.id === ticketId)
  if (!current) return
  const project = findProject(current)
  if (!project) return

  const captured = await captureStageOutput(current)
  const next = nextColumn(sdlcColumns(captured.projectId), captured.stage)
  if (!next || next.kind === 'terminal') return

  await closeTicketTab(captured)

  store.advanceTicket(ticketId)
  const advanced = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!advanced) return
  await handOffStage(advanced, project)
}

/** Into the terminal column is a different operation from a handoff: nothing runs next, and the worktree goes. */
export async function moveTicketOn(ticketId: string): Promise<void> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket) return
  if (nextColumn(sdlcColumns(ticket.projectId), ticket.stage)?.kind === 'terminal') {
    await finishTicket(ticketId)
    return
  }
  await advanceAndHandOff(ticketId)
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
 * Discarding deletes the branch as well as the worktree, so commits that exist
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

/** The title follows whatever the last agent named its terminal, so the request itself is the stable description of the work. */
function leftoverCommitMessage(ticket: SdlcTicket): string {
  return titleFromDescription(ticket.description) || ticket.title
}

/**
 * Into the terminal column: the worktree goes, the work stays. Anything still
 * uncommitted is committed onto the ticket's branch first, and a ticket whose
 * work could not be kept does not move.
 */
export async function finishTicket(ticketId: string): Promise<void> {
  const store = useSdlcStore.getState()
  const ticket = store.tickets.find((t) => t.id === ticketId)
  if (!ticket || nextColumn(sdlcColumns(ticket.projectId), ticket.stage)?.kind !== 'terminal') return
  const captured = await captureStageOutput(ticket)
  const tracked = captured.worktreeId ? await useWorktreeStore.getState().refreshOne(captured.worktreeId) : null
  if (tracked) {
    const error = await finishWorktree(tracked.id, leftoverCommitMessage(captured))
    if (error) {
      store.patchTicket(ticketId, {
        tabId: null,
        status: 'blocked',
        blockedReason: `Could not keep the work on branch ${tracked.branch}: ${error}`
      })
      return
    }
  } else {
    await closeTicketTab(captured)
  }
  store.patchTicket(ticketId, {
    tabId: null,
    worktreeId: null,
    worktreePath: '—',
    status: 'idle',
    blockedReason: null,
    artifacts: activityEntry(currentTicket(captured), `Worktree removed, work kept on branch ${captured.branch}`)
  })
  store.advanceTicket(ticketId)
}

/** The branch outlived its folder when the ticket finished, so the last column's prompt gets the branch checked out again. */
async function reopenTicketWorktree(ticket: SdlcTicket, project: Project): Promise<WorktreeInfo | null> {
  if (ticket.worktreeId) {
    const tracked = await useWorktreeStore.getState().refreshOne(ticket.worktreeId)
    if (tracked) return toWorktreeInfo(tracked)
  }
  const tracked: TrackedWorktree[] = await window.api.worktrees.list(project.id)
  const onBranch = tracked.find((w) => w.branch === ticket.branch)
  if (onBranch) return toWorktreeInfo(onBranch)
  const reopened = await createTrackedWorktreeForProject(project.id, project.path, { existingBranch: ticket.branch })
  return reopened ? toWorktreeInfo(reopened) : null
}

async function launchDoneAction(ticketId: string, trigger: SdlcDoneTrigger): Promise<string | null> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket || ticketColumn(ticket)?.kind !== 'terminal') return null
  const project = findProject(ticket)
  if (!project) return null
  const template = resolveStagePrompt(project.id, ticket.stage).text
  if (!template.trim()) return null
  const { patchTicket } = useSdlcStore.getState()

  const worktree = await reopenTicketWorktree(ticket, project)
  if (!worktree) {
    patchTicket(ticket.id, { blockedReason: `Could not check out branch ${ticket.branch} again. Was it deleted?` })
    return null
  }
  try {
    await window.api.git.ensureInfoExclude(project.path, `${SDLC_SENTINEL_DIR}/`)
  } catch (err) {
    patchTicket(ticket.id, { blockedReason: `Could not prepare the report file: ${err instanceof Error ? err.message : String(err)}` })
    return null
  }
  await clearSentinel(worktree.path)
  await closeTicketTab(currentTicket(ticket))
  const prompt = await renderPrompt(template, currentTicket(ticket), project, worktree)
  const tabId = openColumnTab(ticket, project, worktree, `${prompt}\n\n${DONE_REPORT_CLAUSE}`)
  patchTicket(ticket.id, {
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    tabId,
    blockedReason: null,
    doneActionAt: Date.now(),
    doneActionBy: trigger,
    doneOutcome: null,
    artifacts: activityEntry(currentTicket(ticket), `Ran the ${stageLabel(ticket)} prompt`)
  })
  return tabId
}

/** The last column's prompt has run and its report has not been read yet. */
export function awaitingDoneReport(ticket: SdlcTicket): boolean {
  return (
    !!ticket.doneActionAt &&
    !ticket.doneOutcome &&
    ticket.worktreePath !== '—' &&
    ticketColumn(ticket)?.kind === 'terminal'
  )
}

/** Reads what the last column's prompt did from its report, checked against the pull request gh can see. */
export async function recordDoneOutcome(ticket: SdlcTicket, report: string): Promise<void> {
  const tracked = ticket.worktreeId ? await useWorktreeStore.getState().refreshOne(ticket.worktreeId) : null
  const prState = tracked?.prState ?? ticket.prState
  const outcome = resolveDoneOutcome(report, prState)
  await clearSentinel(ticket.worktreePath)
  useSdlcStore.getState().patchTicket(ticket.id, {
    doneOutcome: outcome,
    prState,
    prUrl: tracked?.prUrl ?? ticket.prUrl,
    artifacts: activityEntry(currentTicket(ticket), `${stageLabel(ticket)} prompt finished: ${DONE_OUTCOME_LABELS[outcome]}`)
  })
}

/** Runs the last column's prompt, such as opening a pull request, for a ticket that finished. */
export async function runDoneAction(ticketId: string): Promise<boolean> {
  return !!(await launchDoneAction(ticketId, 'manual'))
}

const PROMPT_DELIVERY_TIMEOUT_MS = 120_000

/** The queue runner only feeds the active tab, so the next tab may not take focus until this one has its prompt. */
function untilPromptDelivered(tabId: string): Promise<void> {
  return new Promise((resolve) => {
    const delivered = (): boolean =>
      !(useQueueStore.getState().itemsPerTab[tabId]?.length) ||
      !useTerminalStore.getState().tabs.some((t) => t.id === tabId)
    if (delivered()) return resolve()
    const finish = (): void => {
      clearTimeout(timer)
      unsubscribeQueue()
      unsubscribeTabs()
      resolve()
    }
    const check = (): void => {
      if (delivered()) finish()
    }
    const timer = setTimeout(finish, PROMPT_DELIVERY_TIMEOUT_MS)
    const unsubscribeQueue = useQueueStore.subscribe(check)
    const unsubscribeTabs = useTerminalStore.subscribe(check)
  })
}

/** One ticket at a time: each tab has to be the active one until its prompt is sent. */
export async function runDoneActions(ticketIds: readonly string[], trigger: SdlcDoneTrigger = 'manual'): Promise<void> {
  for (const id of ticketIds) {
    const tabId = await launchDoneAction(id, trigger)
    if (tabId) await untilPromptDelivered(tabId)
  }
}

/** Finished tickets whose last-column prompt has never run: what the column button and the project timer act on. */
export function pendingDoneTicketIds(projectId: string): string[] {
  const last = sdlcColumns(projectId).at(-1)
  return useSdlcStore
    .getState()
    .tickets.filter((t) => t.projectId === projectId && t.stage === last?.id && !t.doneActionAt)
    .map((t) => t.id)
}

/** A finished ticket only loses its card; a worktree reopened for its prompt goes too, with any new work kept on the branch. */
export async function removeFinishedTicket(ticketId: string): Promise<void> {
  const ticket = useSdlcStore.getState().tickets.find((t) => t.id === ticketId)
  if (!ticket) return
  const tracked = ticket.worktreeId ? await useWorktreeStore.getState().refreshOne(ticket.worktreeId) : null
  if (tracked) {
    const error = await finishWorktree(tracked.id, leftoverCommitMessage(ticket))
    if (error) {
      useSdlcStore.getState().patchTicket(ticketId, { blockedReason: `Could not clean up the worktree: ${error}` })
      return
    }
  } else {
    await closeTicketTab(ticket)
  }
  useSdlcStore.getState().deleteTicket(ticketId)
}
