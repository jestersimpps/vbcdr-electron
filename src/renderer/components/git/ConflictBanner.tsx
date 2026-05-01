import { X } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useEditorStore } from '@/stores/editor-store'
import { sendToTerminalViaKeyboardEvent } from '@/lib/terminal-utils'

export function ConflictBanner(): React.ReactElement | null {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => s.activeProject)
  const conflictsPerProject = useGitStore((s) => s.conflictsPerProject)
  const conflictsDismissed = useGitStore((s) => s.conflictsDismissed)
  const dismissConflicts = useGitStore((s) => s.dismissConflicts)
  const activeTerminalTabId = useTerminalStore((s) => activeProjectId ? s.activeTabPerProject[activeProjectId] : undefined)
  const openFile = useEditorStore((s) => s.openFile)

  const project = activeProject()
  if (!activeProjectId || !project) return null

  const conflicts = conflictsPerProject[activeProjectId]
  if (!conflicts || conflicts.length === 0 || conflictsDismissed) return null

  const handleView = (): void => {
    for (const conflict of conflicts) {
      const name = conflict.path.split('/').pop() ?? conflict.path
      openFile(activeProjectId, conflict.absolutePath, name, project.path, 'conflict')
    }
  }

  const handleAskClaude = (): void => {
    if (!activeTerminalTabId) return
    const files = conflicts.map((c) => c.path).join(', ')
    sendToTerminalViaKeyboardEvent(
      activeTerminalTabId,
      `Resolve the merge conflicts in these files: ${files}. Read each file, understand both sides, and apply the correct resolution. Then mark them as resolved with git add.`
    )
  }

  return (
    <div className="flex h-7 items-center justify-center gap-2 bg-red-600 text-xs text-white">
      <span>{conflicts.length} merge conflict{conflicts.length > 1 ? 's' : ''} detected</span>
      <button
        onClick={handleView}
        className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
      >
        View
      </button>
      <button
        onClick={handleAskClaude}
        disabled={!activeTerminalTabId}
        className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30 disabled:opacity-50"
      >
        Ask Claude
      </button>
      <button
        onClick={dismissConflicts}
        className="ml-1 rounded p-0.5 hover:bg-white/20"
      >
        <X size={12} />
      </button>
    </div>
  )
}
