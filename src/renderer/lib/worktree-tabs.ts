import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useQueueStore } from '@/stores/queue-store'
import { sendToTerminalViaKeyboardEvent } from '@/lib/terminal-utils'
import type { TerminalTab, TrackedWorktree, WorktreeInfo } from '@/models/types'

export function toWorktreeInfo(worktree: TrackedWorktree): WorktreeInfo {
  return { id: worktree.id, path: worktree.path, branch: worktree.branch, projectPath: worktree.projectPath }
}

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
