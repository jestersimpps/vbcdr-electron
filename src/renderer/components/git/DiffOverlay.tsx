import { useEffect, useMemo } from 'react'
import { X, RotateCcw, FileText } from 'lucide-react'
import { useDiffOverlayStore } from '@/stores/diff-overlay-store'
import { useGitStore } from '@/stores/git-store'
import { useEditorStore } from '@/stores/editor-store'
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
  const isOpen = useDiffOverlayStore((s) => s.openPerProject[projectId] ?? false)
  const paths = useDiffOverlayStore((s) => s.pendingPerProject[projectId])
  const closeForProject = useDiffOverlayStore((s) => s.closeForProject)
  const removePath = useDiffOverlayStore((s) => s.removePath)
  const statusMap = useGitStore((s) => s.statusPerProject[projectId])
  const loadStatus = useGitStore((s) => s.loadStatus)

  const files = useMemo<ChangedFile[]>(() => {
    if (!paths) return []
    return paths.map((absolutePath) => ({
      absolutePath,
      name: basename(absolutePath),
      relativePath: toRelative(absolutePath, cwd),
      status: statusMap?.[absolutePath]
    }))
  }, [paths, cwd, statusMap])

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
    await useEditorStore.getState().openFile(projectId, file.absolutePath, file.name, cwd, file.status)
  }

  const handleRevert = async (file: ChangedFile): Promise<void> => {
    const headContent = await window.api.git.fileAtHead(cwd, file.absolutePath)
    if (headContent === null) return
    await window.api.fs.writeFile(file.absolutePath, headContent)
    removePath(projectId, file.absolutePath)
    await loadStatus(projectId, cwd)
  }

  const handleRevertAll = async (): Promise<void> => {
    for (const file of files) {
      const headContent = await window.api.git.fileAtHead(cwd, file.absolutePath)
      if (headContent !== null) {
        await window.api.fs.writeFile(file.absolutePath, headContent)
      }
    }
    closeForProject(projectId)
    await loadStatus(projectId, cwd)
  }

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col bg-zinc-950 transition-transform duration-200 ease-out ${
        isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText size={13} className="shrink-0 text-emerald-400" />
          <span className="shrink-0 text-[11px] text-zinc-300">Changes from LLM</span>
          {files.length > 0 && (
            <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-400">
              {files.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {files.length > 0 && (
            <button
              onClick={handleRevertAll}
              className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              title="Revert all to HEAD"
            >
              Revert all
            </button>
          )}
          <button
            onClick={() => closeForProject(projectId)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Close (Esc)"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {files.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-600">No changes</div>
        ) : (
          files.map((file) => {
            const statusColor = file.status ? GIT_STATUS_COLORS[file.status] : 'text-zinc-400'
            const statusLabel = file.status ? GIT_STATUS_LABELS[file.status] : '?'
            return (
              <div
                key={file.absolutePath}
                className="group flex items-center gap-1.5 border-b border-zinc-900 px-2 py-1.5 hover:bg-zinc-800/40"
              >
                <span className={`shrink-0 w-3 text-center text-[10px] font-semibold tabular-nums ${statusColor}`}>
                  {statusLabel}
                </span>
                <button
                  onClick={() => handleOpenFile(file)}
                  className="min-w-0 flex-1 text-left"
                  title={file.relativePath}
                >
                  <div className={`truncate text-[11px] leading-tight ${statusColor}`}>
                    {file.name}
                  </div>
                  <div className="truncate text-[9px] text-zinc-500">
                    {file.relativePath}
                  </div>
                </button>
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
    </div>
  )
}
