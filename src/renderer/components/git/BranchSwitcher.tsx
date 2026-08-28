import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Loader2, Search, Check, Cloud, Sparkles } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import type { GitBranch } from '@/models/types'
import { NewFeatureModal } from '@/components/git/NewFeatureModal'
import { useTerminalStore } from '@/stores/terminal-store'

interface BranchSwitcherProps {
  projectId?: string
  cwd?: string
  isOpen: boolean
  onToggle: () => void
}

export function BranchSwitcher({ projectId, cwd, isOpen, onToggle }: BranchSwitcherProps): React.ReactElement | null {
  const fallbackActiveProjectId = useProjectStore((s) => s.activeProjectId)
  const fallbackActiveProject = useProjectStore((s) => s.activeProject)
  const branchesPerProject = useGitStore((s) => s.branchesPerProject)
  const switchingBranch = useGitStore((s) => s.switchingBranch)

  const effectiveProjectId = projectId ?? fallbackActiveProjectId
  const effectivePath = cwd ?? fallbackActiveProject()?.path
  const branches = effectiveProjectId ? branchesPerProject[effectiveProjectId] : undefined
  const currentBranch = branches?.find((b) => b.current)

  if (!currentBranch || !effectiveProjectId || !effectivePath) return null

  return (
    <button
      onClick={onToggle}
      disabled={switchingBranch}
      className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-micro font-medium text-green-400 transition-colors disabled:opacity-50 ${
        isOpen ? 'bg-green-400/30' : 'bg-green-400/15 hover:bg-green-400/25'
      }`}
      title={isOpen ? 'Hide branches' : 'Show all branches'}
    >
      {switchingBranch && <Loader2 size={10} className="animate-spin" />}
      <span className="max-w-[140px] truncate">{currentBranch.name}</span>
      <ChevronDown size={9} className={`opacity-70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>
  )
}

const PRIMARY_BRANCHES = ['main', 'master', 'develop', 'development', 'dev']

function isPrimary(branch: GitBranch): boolean {
  return primaryRank(branch) < PRIMARY_BRANCHES.length
}

function primaryRank(branch: GitBranch): number {
  const bare = branch.remote ? branch.name.replace(/^[^/]+\//, '') : branch.name
  const index = PRIMARY_BRANCHES.indexOf(bare.toLowerCase())
  return index === -1 ? PRIMARY_BRANCHES.length : index
}

function byPrimaryThenDate(a: GitBranch, b: GitBranch): number {
  const rankDiff = primaryRank(a) - primaryRank(b)
  if (rankDiff !== 0) return rankDiff
  return b.isoDate.localeCompare(a.isoDate)
}

interface BranchPanelProps {
  projectId?: string
  cwd?: string
  onClose: () => void
}

export function BranchPanel({ projectId, cwd, onClose }: BranchPanelProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  const [newBranchBase, setNewBranchBase] = useState<string | null>(null)
  const fallbackActiveProjectId = useProjectStore((s) => s.activeProjectId)
  const fallbackActiveProject = useProjectStore((s) => s.activeProject)
  const effectiveProjectId = projectId ?? fallbackActiveProjectId
  const branchesPerProject = useGitStore((s) => s.branchesPerProject)
  const switchingBranch = useGitStore((s) => s.switchingBranch)
  const switchBranch = useGitStore((s) => s.switchBranch)
  const activeTerminalTabId = useTerminalStore((s) =>
    effectiveProjectId ? s.activeTabPerProject[effectiveProjectId] : undefined
  )
  const loadTree = useFileTreeStore((s) => s.loadTree)

  const effectivePath = cwd ?? fallbackActiveProject()?.path
  const branches = useMemo(
    () => (effectiveProjectId ? branchesPerProject[effectiveProjectId] ?? [] : []),
    [branchesPerProject, effectiveProjectId]
  )
  const currentBranch = branches.find((b) => b.current)?.name ?? ''

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const localBranches = useMemo(
    () => branches.filter((b) => !b.remote).slice().sort(byPrimaryThenDate),
    [branches]
  )
  const remoteBranches = useMemo(() => {
    const localNames = new Set(localBranches.map((b) => b.name))
    return branches
      .filter((b) => b.remote && !localNames.has(b.name.replace(/^[^/]+\//, '')))
      .sort(byPrimaryThenDate)
  }, [branches, localBranches])

  const needle = filter.trim().toLowerCase()
  const filteredLocal = useMemo(
    () => (needle ? localBranches.filter((b) => b.name.toLowerCase().includes(needle)) : localBranches),
    [localBranches, needle]
  )
  const filteredRemote = useMemo(
    () => (needle ? remoteBranches.filter((b) => b.name.toLowerCase().includes(needle)) : remoteBranches),
    [remoteBranches, needle]
  )

  if (!effectiveProjectId || !effectivePath) return null

  const handleSwitch = async (branch: GitBranch): Promise<void> => {
    if (branch.name === currentBranch) return
    onClose()
    const success = await switchBranch(effectiveProjectId, effectivePath, branch.name)
    if (success) {
      loadTree(effectiveProjectId, effectivePath)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const first = [...filteredLocal, ...filteredRemote].find((b) => b.name !== currentBranch)
      if (first) handleSwitch(first)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/30 p-2">
        <div className="relative">
          <Search size={11} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter branches…"
            className="w-full rounded border border-zinc-800 bg-zinc-950 py-1 pl-6 pr-2 text-meta text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredLocal.length > 0 && (
          <div className="p-1">
            <div className="px-2 py-1 text-micro font-medium uppercase tracking-wide text-zinc-500">Local</div>
            {filteredLocal.map((b) => (
              <BranchRow
                key={b.name}
                branch={b}
                isCurrent={b.name === currentBranch}
                disabled={switchingBranch}
                onSelect={handleSwitch}
                onCreateFrom={activeTerminalTabId ? setNewBranchBase : undefined}
              />
            ))}
          </div>
        )}
        {filteredRemote.length > 0 && (
          <div className="p-1">
            <div className="px-2 py-1 text-micro font-medium uppercase tracking-wide text-zinc-500">Remote</div>
            {filteredRemote.map((b) => (
              <BranchRow
                key={b.name}
                branch={b}
                isCurrent={false}
                disabled={switchingBranch}
                onSelect={handleSwitch}
                onCreateFrom={activeTerminalTabId ? setNewBranchBase : undefined}
              />
            ))}
          </div>
        )}
        {filteredLocal.length === 0 && filteredRemote.length === 0 && (
          <div className="p-4 text-center text-xs text-zinc-600">
            {branches.length === 0 ? 'No branches' : 'No matches'}
          </div>
        )}
      </div>

      {newBranchBase && activeTerminalTabId && (
        <NewFeatureModal
          terminalTabId={activeTerminalTabId}
          baseBranch={newBranchBase}
          onClose={() => setNewBranchBase(null)}
        />
      )}
    </div>
  )
}

interface BranchRowProps {
  branch: GitBranch
  isCurrent: boolean
  disabled: boolean
  onSelect: (branch: GitBranch) => void
  onCreateFrom?: (baseBranch: string) => void
}

function BranchRow({ branch, isCurrent, disabled, onSelect, onCreateFrom }: BranchRowProps): React.ReactElement {
  const slash = branch.remote ? branch.name.indexOf('/') : -1
  const remoteName = slash > 0 ? branch.name.slice(0, slash) : null
  const shortName = slash > 0 ? branch.name.slice(slash + 1) : branch.name

  return (
    <div className="group relative flex items-center">
    <button
      onClick={() => onSelect(branch)}
      disabled={disabled || isCurrent}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body ${
        isCurrent
          ? 'cursor-default bg-green-400/10 text-green-400'
          : 'text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40'
      }`}
      title={
        isCurrent
          ? 'Current branch'
          : branch.remote
          ? `Check out ${branch.name} as a local branch`
          : `Switch to ${branch.name}`
      }
    >
      {branch.remote ? (
        <Cloud size={11} className="shrink-0 text-sky-400/70" />
      ) : (
        <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${isCurrent ? 'bg-green-400' : 'bg-zinc-600'}`} />
      )}
      {remoteName && (
        <span className="shrink-0 rounded bg-sky-400/10 px-1 py-px font-mono text-micro text-sky-400/80">
          {remoteName}
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${branch.remote ? 'text-zinc-400' : ''}`}>{shortName}</span>
      {branch.date && (
        <span className="shrink-0 text-micro text-zinc-600">{branch.date}</span>
      )}
      {isCurrent && <Check size={11} className="shrink-0" />}
      {isPrimary(branch) && onCreateFrom && <span className="w-5 shrink-0" aria-hidden />}
    </button>
    {isPrimary(branch) && onCreateFrom && (
      <button
        onClick={() => onCreateFrom(branch.name)}
        disabled={disabled}
        className="absolute right-1 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        title={`New branch from ${branch.name}`}
      >
        <Sparkles size={12} />
      </button>
    )}
    </div>
  )
}
