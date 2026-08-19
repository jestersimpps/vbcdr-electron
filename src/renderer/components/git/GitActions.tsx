import { useState } from 'react'
import { GitCommitHorizontal, Sparkles } from 'lucide-react'
import { useGitStore } from '@/stores/git-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { sendToTerminalViaKeyboardEvent } from '@/lib/terminal-utils'
import { NewFeatureModal } from '@/components/git/NewFeatureModal'

export function GitActions(): React.ReactElement | null {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })
  const activeTerminalTabId = useTerminalStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : undefined
  )
  const isRepo = useGitStore((s) => (activeProjectId ? s.isRepoPerProject[activeProjectId] : false))

  const [featureModalOpen, setFeatureModalOpen] = useState(false)

  if (!activeProject || !isRepo) return null

  return (
    <>
      <button
        disabled={!activeTerminalTabId}
        onClick={() => activeTerminalTabId && sendToTerminalViaKeyboardEvent(activeTerminalTabId, '/commit')}
        onMouseDown={(e) => e.preventDefault()}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
        title="Commit"
      >
        <GitCommitHorizontal size={16} />
      </button>
      <button
        disabled={!activeTerminalTabId}
        onClick={() => setFeatureModalOpen(true)}
        onMouseDown={(e) => e.preventDefault()}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
        title="New Feature"
      >
        <Sparkles size={16} />
      </button>
      {featureModalOpen && activeTerminalTabId && (
        <NewFeatureModal
          terminalTabId={activeTerminalTabId}
          onClose={() => setFeatureModalOpen(false)}
        />
      )}
    </>
  )
}
