import { X } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'

export function DriftBanner(): React.ReactElement | null {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => s.activeProject)
  const driftPerProject = useGitStore((s) => s.driftPerProject)
  const driftDismissed = useGitStore((s) => s.driftDismissed)
  const dismissDrift = useGitStore((s) => s.dismissDrift)
  const pullAction = useGitStore((s) => s.pull)
  const rebaseAction = useGitStore((s) => s.rebaseRemote)

  const project = activeProject()
  if (!activeProjectId || !project) return null

  const drift = driftPerProject[activeProjectId]
  if (!drift || driftDismissed[activeProjectId]) return null
  if (drift.behind === 0 && !drift.diverged) return null

  const isDiverged = drift.diverged
  const bgColor = isDiverged ? 'bg-amber-600' : 'bg-blue-600'

  const message = isDiverged
    ? `Branch has diverged: ${drift.ahead} ahead, ${drift.behind} behind ${drift.remoteBranch ?? 'remote'}`
    : `Branch is ${drift.behind} commit${drift.behind > 1 ? 's' : ''} behind ${drift.remoteBranch ?? 'remote'}`

  return (
    <div className={`flex h-7 items-center justify-center gap-2 ${bgColor} text-xs text-white`}>
      <span>{message}</span>
      {isDiverged ? (
        <button
          onClick={() => rebaseAction(activeProjectId, project.path)}
          className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
        >
          Rebase
        </button>
      ) : (
        <button
          onClick={() => pullAction(activeProjectId, project.path)}
          className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
        >
          Pull
        </button>
      )}
      <button
        onClick={() => dismissDrift(activeProjectId)}
        className="ml-1 rounded p-0.5 hover:bg-white/20"
      >
        <X size={12} />
      </button>
    </div>
  )
}
