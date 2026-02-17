import { useEffect, useState, useRef } from 'react'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useGitStore } from '@/stores/git-store'
import { ChevronRight, ChevronDown, File, Folder, RefreshCw, Copy } from 'lucide-react'
import type { FileNode, GitFileStatus } from '@/models/types'

const GIT_STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: 'text-amber-300',
  added: 'text-emerald-400',
  untracked: 'text-emerald-400',
  deleted: 'text-red-400',
  renamed: 'text-emerald-400',
  conflict: 'text-red-500'
}

const GIT_STATUS_LABELS: Record<GitFileStatus, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  renamed: 'R',
  conflict: 'C'
}

interface ContextMenuState {
  x: number
  y: number
  path: string
  name: string
  isDirectory: boolean
}

function ContextMenu({
  menu,
  onClose
}: {
  menu: ContextMenuState
  onClose: () => void
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleCopyPath = (): void => {
    navigator.clipboard.writeText(menu.path)
    onClose()
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        onClick={handleCopyPath}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
      >
        <Copy size={12} />
        Copy path
      </button>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  projectId,
  cwd,
  onContextMenu
}: {
  node: FileNode
  depth: number
  projectId: string
  cwd: string
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
}): React.ReactElement {
  const expandedPaths = useFileTreeStore((s) => s.expandedPerProject[projectId])
  const { toggleExpanded } = useFileTreeStore()
  const { openFile } = useEditorStore()
  const activeFilePath = useEditorStore((s) => s.statePerProject[projectId]?.activeFilePath ?? null)
  const gitStatus = useGitStore((s) => s.statusPerProject[projectId])
  const isExpanded = expandedPaths?.has(node.path) ?? false
  const fileStatus = gitStatus?.[node.path]
  const statusColor = fileStatus ? GIT_STATUS_COLORS[fileStatus] : ''

  if (!node.isDirectory) {
    const isActive = node.path === activeFilePath
    return (
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm hover:bg-zinc-800/50 ${
          isActive ? 'bg-zinc-800/70' : ''
        } ${statusColor || (isActive ? 'text-zinc-200' : 'text-zinc-400')}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => openFile(projectId, node.path, node.name, cwd, fileStatus)}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <File size={14} className="shrink-0 text-zinc-600" />
        <span className="flex-1 truncate">{node.name}</span>
        {fileStatus && (
          <span className={`shrink-0 text-[10px] font-semibold ${statusColor}`}>
            {GIT_STATUS_LABELS[fileStatus]}
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm ${statusColor || 'text-zinc-300'} hover:bg-zinc-800/50`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => toggleExpanded(projectId, node.path)}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-zinc-500" />
        )}
        <Folder size={14} className="shrink-0 text-zinc-500" />
        <span className="truncate">{node.name}</span>
      </div>
      {isExpanded &&
        node.children?.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} projectId={projectId} cwd={cwd} onContextMenu={onContextMenu} />
        ))}
    </div>
  )
}

export function FileTree({ projectId }: { projectId: string }): React.ReactElement {
  const activeProject = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)
  )
  const tree = useFileTreeStore((s) => s.treePerProject[projectId])
  const { loadTree, setTree } = useFileTreeStore()
  const { loadStatus } = useGitStore()
  const { openDefaultFile } = useEditorStore()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const defaultFileOpened = useRef(false)

  useEffect(() => {
    if (!activeProject) return

    if (!tree) {
      loadTree(projectId, activeProject.path)
    }

    loadStatus(projectId, activeProject.path)

    window.api.fs.watch(activeProject.path)

    const unsub = window.api.fs.onTreeChanged((newTree) => {
      setTree(projectId, newTree as FileNode)
      loadStatus(projectId, activeProject.path)
    })

    return () => {
      unsub()
      window.api.fs.unwatch()
    }
  }, [projectId])

  useEffect(() => {
    if (tree && !defaultFileOpened.current) {
      defaultFileOpened.current = true
      openDefaultFile(projectId, tree)
    }
  }, [tree, projectId])

  const handleContextMenu = (e: React.MouseEvent, node: FileNode): void => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      name: node.name,
      isDirectory: node.isDirectory
    })
  }

  if (!activeProject) {
    return (
      <div className="p-4 text-center text-xs text-zinc-600">Select a project to browse files</div>
    )
  }

  if (!tree) {
    return <div className="p-4 text-center text-xs text-zinc-600">Loading...</div>
  }

  const handleRefresh = (): void => {
    loadTree(projectId, activeProject.path)
    loadStatus(projectId, activeProject.path)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Explorer</span>
        <button
          onClick={handleRefresh}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {tree.children?.map((child) => (
          <TreeNode key={child.path} node={child} depth={0} projectId={projectId} cwd={activeProject.path} onContextMenu={handleContextMenu} />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
