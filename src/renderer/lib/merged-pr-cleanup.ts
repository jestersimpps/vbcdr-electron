import { useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { finishWorktree, findLiveWorktreeTab } from '@/lib/worktree-tabs'
import { isSdlcTab } from '@/config/terminal-profiles'
import type { SdlcTicket } from '@/models/sdlc'
import type { TrackedWorktree } from '@/models/types'

/** A manual tab open in the worktree may be mid-conversation; only a board-driven one is safe to close. */
function inUseByHand(worktreeId: string): boolean {
  const tab = findLiveWorktreeTab(worktreeId)
  return !!tab && !isSdlcTab(tab)
}

function ticketFor(worktree: TrackedWorktree): SdlcTicket | undefined {
  return useSdlcStore.getState().tickets.find((t) => t.worktreeId === worktree.id)
}

/** Keeps a ticket's card in step with the pull request on its branch, whether or not the worktree goes. */
function syncTicketPr(worktree: TrackedWorktree): void {
  const ticket = ticketFor(worktree)
  if (!ticket || !worktree.prUrl) return
  if (ticket.prUrl === worktree.prUrl && ticket.prState === worktree.prState) return
  useSdlcStore.getState().patchTicket(ticket.id, { prUrl: worktree.prUrl, prState: worktree.prState })
}

async function removeMerged(worktree: TrackedWorktree): Promise<void> {
  const ticket = ticketFor(worktree)
  const error = await finishWorktree(worktree.id, ticket?.title || `Leftover work on ${worktree.branch}`)
  if (!ticket) return
  const { patchTicket } = useSdlcStore.getState()
  if (error) {
    patchTicket(ticket.id, { blockedReason: `Pull request merged, but the worktree could not be removed: ${error}` })
    return
  }
  const activity = [...ticket.artifacts.activity, { at: Date.now(), text: 'Pull request merged, worktree removed' }]
  patchTicket(ticket.id, {
    worktreeId: null,
    tabId: null,
    prUrl: worktree.prUrl,
    prState: 'merged',
    blockedReason: null,
    artifacts: { ...ticket.artifacts, activity }
  })
}

/**
 * Once a worktree's pull request is merged its folder has no more use: it is
 * removed with the branch kept and anything uncommitted committed onto it, the
 * same way a ticket finishing leaves it. Worktrees a person has a tab open in
 * are left alone.
 */
export async function cleanUpMergedWorktrees(projectId: string): Promise<void> {
  const store = useWorktreeStore.getState()
  await store.load(projectId)
  if (!useWorktreeStore.getState().worktreesPerProject[projectId]?.length) return
  await store.refreshProject(projectId)
  for (const worktree of useWorktreeStore.getState().worktreesPerProject[projectId] ?? []) {
    syncTicketPr(worktree)
    if (worktree.prState === 'merged' && !inUseByHand(worktree.id)) await removeMerged(worktree)
  }
}
