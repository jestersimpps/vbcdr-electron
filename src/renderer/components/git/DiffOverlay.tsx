import { useEffect, useMemo, useState } from 'react'
import { X, RotateCcw, FileText, GitCommit, EyeOff, Eye, List } from 'lucide-react'
import { useDiffOverlayStore } from '@/stores/diff-overlay-store'
import { useGitStore } from '@/stores/git-store'
import { useEditorStore } from '@/stores/editor-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { GIT_STATUS_COLORS, GIT_STATUS_LABELS } from '@/config/git-status-style'
import type { GitFileStatus } from '@/models/types'

interface DiffOverlayProps {
  projectId: string
  cwd: string
}

interface ChangedFile {
  absolutePath: string
  name: string
  relativePath: string
  status: GitFileStatus | undefined
}

function toRelative(absolutePath: string, cwd: string): string {
  if (absolutePath.startsWith(cwd)) {
    const rest = absolutePath.slice(cwd.length)
    return rest.startsWith('/') ? rest.slice(1) : rest
  }
  return absolutePath
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

export function DiffOverlay({ projectId, cwd }: DiffOverlayProps): React.ReactElement | null {
  const dismissed = useDiffOverlayStore((s) => s.dismissedPerProject[projectId] ?? false)
  const excluded = useDiffOverlayStore((s) => s.excludedPerProject[projectId])
  const closeForProject = useDiffOverlayStore((s) => s.closeForProject)
  const resetDismiss = useDiffOverlayStore((s) => s.resetDismiss)
  const toggleExcluded = useDiffOverlayStore((s) => s.toggleExcluded)
  const clearExcluded = useDiffOverlayStore((s) => s.clearExcluded)
  const statusMap = useGitStore((s) => s.statusPerProject[projectId])
  const loadStatus = useGitStore((s) => s.loadStatus)

  const files = useMemo<ChangedFile[]>(() => {
    if (!statusMap) return []
    const allPaths = Object.keys(statusMap).filter((p) => p !== cwd)
    const leafPaths = allPaths.filter(
      (p) => !allPaths.some((other) => other !== p && other.startsWith(p + '/'))
    )
    return leafPaths.map((absolutePath) => ({
      absolutePath,
      name: basename(absolutePath),
      relativePath: toRelative(absolutePath, cwd),
      status: statusMap[absolutePath]
    }))
  }, [cwd, statusMap])

  const isOpen = files.length > 0 && !dismissed

  useEffect(() => {
    if (files.length === 0 && dismissed) resetDismiss(projectId)
  }, [files.length, dismissed, projectId, resetDismiss])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeForProject(projectId)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, projectId, closeForProject])

  const handleOpenFile = async (file: ChangedFile): Promise<void> => {
    const line = await window.api.git.firstChangedLine(cwd, file.absolutePath)
    if (line && line >= 1) {
      useEditorStore.getState().setPendingRevealLine(file.absolutePath, line)
    }
    await useEditorStore.getState().openFile(projectId, file.absolutePath, file.name, cwd, file.status)
    closeForProject(projectId)
  }

  const handleRevert = async (file: ChangedFile): Promise<void> => {
    const headContent = await window.api.git.fileAtHead(cwd, file.absolutePath)
    if (headContent === null) return
    await window.api.fs.writeFile(file.absolutePath, headContent)
    await loadStatus(projectId, cwd)
  }

  const handleRevertAll = async (): Promise<void> => {
    for (const file of files) {
      const headContent = await window.api.git.fileAtHead(cwd, file.absolutePath)
      if (headContent !== null) {
        await window.api.fs.writeFile(file.absolutePath, headContent)
      }
    }
    await loadStatus(projectId, cwd)
  }

  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const [ignoredEntries, setIgnoredEntries] = useState<string[]>([])

  const loadIgnored = async (): Promise<void> => {
    const entries = await window.api.git.gitignoreList(cwd)
    setIgnoredEntries(entries)
  }

  useEffect(() => {
    loadIgnored()
  }, [cwd, statusMap])

  const handleUnignore = async (entry: string): Promise<void> => {
    const result = await window.api.git.gitignoreRemove(cwd, entry)
    if (!result.success) return
    await loadIgnored()
    await loadStatus(projectId, cwd)
  }

  const handleToggleIgnore = async (file: ChangedFile): Promise<void> => {
    const entry = file.relativePath
    const isIgnored = ignoredEntries.includes(entry)
    const result = isIgnored
      ? await window.api.git.gitignoreRemove(cwd, entry)
      : await window.api.git.ignorePath(cwd, file.absolutePath)
    if (!result.success) return
    await loadIgnored()
    await loadStatus(projectId, cwd)
  }

  const llmCommit = (): void => {
    const tState = useTerminalStore.getState()
    const llmTab = tState.tabs.find((t) => t.projectId === projectId && !!t.initialCommand)
    if (!llmTab) {
      setCommitError('No LLM tab found in this project')
      return
    }
    tState.setActiveTab(projectId, llmTab.id)
    useEditorStore.getState().setCenterTab(projectId, 'terminals')
    window.api.terminal.write(llmTab.id, 'commit the current changes\r')
  }

  const includedPaths = useMemo(
    () => files.filter((f) => !excluded?.has(f.absolutePath)).map((f) => f.absolutePath),
    [files, excluded]
  )

  const handleCommit = async (): Promise<void> => {
    if (committing) return
    if (includedPaths.length === 0) return
    const message = commitMessage.trim()
    if (!message) {
      llmCommit()
      return
    }
    setCommitting(true)
    setCommitError(null)
    const hasExclusions = includedPaths.length !== files.length
    const result = hasExclusions
      ? await window.api.git.commitPaths(cwd, message, includedPaths)
      : await window.api.git.commitAll(cwd, message)
    setCommitting(false)
    if (!result.success) {
      setCommitError(result.error ?? 'Commit failed')
      return
    }
    setCommitMessage('')
    clearExcluded(projectId)
    useEditorStore.getState().setCenterTab(projectId, 'terminals')
    await loadStatus(projectId, cwd)
    await useGitStore.getState().loadGitData(projectId, cwd)
  }

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col bg-zinc-950 transition-transform duration-200 ease-out ${
        isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText size={13} className={`shrink-0 ${showIgnored ? 'text-amber-400' : 'text-emerald-400'}`} />
          <span className="shrink-0 text-[11px] text-zinc-300">
            {showIgnored ? '.gitignore' : 'Changes from LLM'}
          </span>
          {showIgnored ? (
            ignoredEntries.length > 0 && (
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-400">
                {ignoredEntries.length}
              </span>
            )
          ) : (
            files.length > 0 && (
              <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-400">
                {includedPaths.length === files.length ? files.length : `${includedPaths.length}/${files.length}`}
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-1">
          {files.length > 0 && !showIgnored && (
            <button
              onClick={handleRevertAll}
              className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              title="Revert all to HEAD"
            >
              Revert all
            </button>
          )}
          <button
            onClick={() => setShowIgnored((v) => !v)}
            className={`rounded p-1 hover:bg-zinc-800 ${showIgnored ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={showIgnored ? 'Show changes' : 'Show .gitignore entries'}
          >
            {showIgnored ? <FileText size={12} /> : <List size={12} />}
          </button>
          <button
            onClick={() => closeForProject(projectId)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Close (Esc)"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {showIgnored ? (
          ignoredEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-600">No .gitignore entries</div>
          ) : (
            ignoredEntries.map((entry) => (
              <div
                key={entry}
                className="group flex items-center gap-1.5 border-b border-zinc-900 px-2 py-1.5 hover:bg-zinc-800/40"
              >
                <span className="shrink-0 w-3 text-center text-[10px] font-semibold tabular-nums text-amber-400">I</span>
                <div className="min-w-0 flex-1 truncate text-[11px] leading-tight text-zinc-300" title={entry}>
                  {entry}
                </div>
                <button
                  onClick={() => handleUnignore(entry)}
                  className="shrink-0 rounded p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-emerald-400"
                  title="Remove from .gitignore"
                >
                  <Eye size={11} />
                </button>
              </div>
            ))
          )
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-600">No changes</div>
        ) : (
          files.map((file) => {
            const statusColor = file.status ? GIT_STATUS_COLORS[file.status] : 'text-zinc-400'
            const statusLabel = file.status ? GIT_STATUS_LABELS[file.status] : '?'
            const isExcluded = excluded?.has(file.absolutePath) ?? false
            return (
              <div
                key={file.absolutePath}
                className={`group flex items-center gap-1.5 border-b border-zinc-900 px-2 py-1.5 hover:bg-zinc-800/40 ${
                  isExcluded ? 'opacity-40' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => toggleExcluded(projectId, file.absolutePath)}
                  className="shrink-0 cursor-pointer accent-emerald-500"
                  title={isExcluded ? 'Include in commit' : 'Exclude from commit'}
                />
                <span className={`shrink-0 w-3 text-center text-[10px] font-semibold tabular-nums ${statusColor}`}>
                  {statusLabel}
                </span>
                <button
                  onClick={() => handleOpenFile(file)}
                  className="min-w-0 flex-1 text-left"
                  title={file.relativePath}
                >
                  <div className={`truncate text-[11px] leading-tight ${statusColor} ${isExcluded ? 'line-through' : ''}`}>
                    {file.name}
                  </div>
                  <div className="truncate text-[9px] text-zinc-500">
                    {file.relativePath}
                  </div>
                </button>
                {(() => {
                  const isIgnored = ignoredEntries.includes(file.relativePath)
                  return (
                    <button
                      onClick={() => handleToggleIgnore(file)}
                      className={`shrink-0 rounded p-1 hover:bg-zinc-800 ${
                        isIgnored
                          ? 'text-amber-400 opacity-100 hover:text-emerald-400'
                          : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-amber-400'
                      }`}
                      title={isIgnored ? 'Remove from .gitignore' : 'Add to .gitignore'}
                    >
                      {isIgnored ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                  )
                })()}
                <button
                  onClick={() => handleRevert(file)}
                  className="shrink-0 rounded p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-red-400"
                  title="Revert to HEAD"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {files.length > 0 && !showIgnored && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/50 p-2">
          {commitError && (
            <div className="mb-1 truncate text-[10px] text-red-400" title={commitError}>
              {commitError}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleCommit()
                }
              }}
              placeholder="Commit message — empty for LLM commit"
              disabled={committing}
              className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
            />
            <button
              onClick={handleCommit}
              disabled={committing || includedPaths.length === 0}
              className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                includedPaths.length === 0
                  ? 'No files included'
                  : commitMessage.trim()
                    ? `Commit ${includedPaths.length} file${includedPaths.length === 1 ? '' : 's'}`
                    : 'Have the LLM commit the current changes'
              }
            >
              <GitCommit size={11} />
              <span>{committing ? 'Committing…' : commitMessage.trim() ? 'Commit' : 'LLM commit'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
