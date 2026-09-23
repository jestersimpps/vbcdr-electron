import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useQueueStore } from '@/stores/queue-store'
import { sendToTerminalViaKeyboardEvent } from '@/lib/terminal-utils'
import { toWorktreeInfo, useWorktreeStore } from '@/stores/worktree-store'
import { disposeTerminal } from '@/components/terminal/TerminalInstance'
import type { TerminalTab, TrackedWorktree } from '@/models/types'

export function findLiveWorktreeTab(worktreeId: string): TerminalTab | undefined {
  return useTerminalStore.getState().tabs.find((t) => t.worktree?.id === worktreeId)
}

export function openWorktreeTab(worktree: TrackedWorktree, instruction?: string): string {
  const store = useTerminalStore.getState()
  const existing = findLiveWorktreeTab(worktree.id)
  if (existing) {
    store.setActiveTab(existing.projectId, existing.id)
    if (instruction) sendToTerminalViaKeyboardEvent(existing.id, instruction)
    return existing.id
  }
  const command = useLayoutStore.getState().getLlmStartupCommand()
  const tabId = store.createTab(worktree.projectId, worktree.path, command, toWorktreeInfo(worktree))
  if (instruction) useQueueStore.getState().addItem(tabId, instruction)
  return tabId
}

function closeLiveWorktreeTab(worktreeId: string): void {
  const liveTab = findLiveWorktreeTab(worktreeId)
  if (!liveTab) return
  window.api.terminal.kill(liveTab.id)
  disposeTerminal(liveTab.id)
  useTerminalStore.getState().closeTab(liveTab.id)
  useQueueStore.getState().clearTab(liveTab.id)
}

export async function deleteWorktree(worktreeId: string): Promise<string | null> {
  closeLiveWorktreeTab(worktreeId)
  return useWorktreeStore.getState().remove(worktreeId)
}

export async function finishWorktree(worktreeId: string, commitMessage: string): Promise<string | null> {
  closeLiveWorktreeTab(worktreeId)
  return useWorktreeStore.getState().finish(worktreeId, commitMessage)
}
