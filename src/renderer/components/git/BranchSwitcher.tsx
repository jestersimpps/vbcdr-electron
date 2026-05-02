import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import type { GitBranch } from '@/models/types'

interface BranchSwitcherProps {
  projectId?: string
  cwd?: string
}

export function BranchSwitcher({ projectId, cwd }: BranchSwitcherProps = {}): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false)
  const fallbackActiveProjectId = useProjectStore((s) => s.activeProjectId)
  const fallbackActiveProject = useProjectStore((s) => s.activeProject)
  const branchesPerProject = useGitStore((s) => s.branchesPerProject)
  const switchingBranch = useGitStore((s) => s.switchingBranch)
  const switchBranch = useGitStore((s) => s.switchBranch)
  const loadTree = useFileTreeStore((s) => s.loadTree)

  const effectiveProjectId = projectId ?? fallbackActiveProjectId
  const effectivePath = cwd ?? fallbackActiveProject()?.path
  const branches = effectiveProjectId ? branchesPerProject[effectiveProjectId] : undefined
  const currentBranch = branches?.find((b) => b.current)

  if (!currentBranch || !effectiveProjectId || !effectivePath) return null

  const handleSwitch = async (branch: GitBranch): Promise<void> => {
    setIsOpen(false)
    const success = await switchBranch(effectiveProjectId, effectivePath, branch.name)
    if (success) {
      loadTree(effectiveProjectId, effectivePath)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switchingBranch}
        className="flex shrink-0 items-center gap-1 rounded bg-green-400/15 px-1.5 py-px text-[10px] font-medium text-green-400 transition-colors hover:bg-green-400/25 disabled:opacity-50"
      >
        {switchingBranch && <Loader2 size={10} className="animate-spin" />}
        <span className="max-w-[140px] truncate">{currentBranch.name}</span>
        <ChevronDown size={9} className="opacity-70" />
      </button>

      {isOpen && (
        <BranchMenu
          branches={branches ?? []}
          currentBranch={currentBranch.name}
          onSelect={handleSwitch}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

interface BranchMenuProps {
  branches: GitBranch[]
  currentBranch: string
  onSelect: (branch: GitBranch) => void
  onClose: () => void
}

function BranchMenu({ branches, currentBranch, onSelect, onClose }: BranchMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const localBranches = useMemo(() => branches.filter((b) => !b.remote), [branches])
  const remoteBranches = useMemo(() => {
    const localNames = new Set(localBranches.map((b) => b.name))
    return branches.filter((b) => b.remote && !localNames.has(b.name.replace(/^[^/]+\//, '')))
  }, [branches, localBranches])

  return (
    <div
      ref={menuRef}
      className="absolute top-full left-0 mt-1 w-56 rounded border border-zinc-700 bg-zinc-900 shadow-lg max-h-72 overflow-y-auto z-50"
    >
      {localBranches.length > 0 && (
        <div className="p-2 border-b border-zinc-800">
          <div className="text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide">Local</div>
          {localBranches.map((b) => (
            <button
              key={b.name}
              onClick={() => b.name !== currentBranch && onSelect(b)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs ${
                b.name === currentBranch
                  ? 'text-green-400 cursor-default'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${b.name === currentBranch ? 'bg-green-400' : 'bg-zinc-600'}`} />
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
      {remoteBranches.length > 0 && (
        <div className="p-2">
          <div className="text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide">Remote</div>
          {remoteBranches.map((b) => (
            <button
              key={b.name}
              onClick={() => onSelect(b)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
      {localBranches.length === 0 && remoteBranches.length === 0 && (
        <div className="p-3 text-center text-xs text-zinc-600">No branches</div>
      )}
    </div>
  )
}
