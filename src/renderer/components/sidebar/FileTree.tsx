import { useEffect, useState, useRef, useCallback } from 'react'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useGitStore } from '@/stores/git-store'
import {
  ChevronRight, ChevronDown, File, Folder, RefreshCw,
  Eye, EyeOff, FilePlus, FolderPlus, Search, FileText
} from 'lucide-react'
import type { FileNode, SearchResult } from '@/models/types'
import { GIT_STATUS_COLORS, GIT_STATUS_LABELS } from '@/config/git-status-style'
import { FileContextMenu, DeleteConfirm, type ContextMenuTarget } from '@/components/sidebar/FileContextMenu'

interface InlineInputState {
  parentPath: string
  type: 'file' | 'folder' | 'rename'
  currentName?: string
  currentPath?: string
}

function InlineInput({
  type,
  currentName,
  onSubmit,
  onCancel,
  depth
}: {
  type: 'file' | 'folder' | 'rename'
  currentName?: string
  onSubmit: (value: string) => void
  onCancel: () => void
  depth: number
}): React.ReactElement {
  const [value, setValue] = useState(currentName ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (currentName) {
      const dotIdx = currentName.lastIndexOf('.')
      inputRef.current?.setSelectionRange(0, dotIdx > 0 ? dotIdx : currentName.length)
    }
  }, [currentName])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit(value.trim())
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const icon = type === 'folder' ? <Folder size={14} className="shrink-0 text-zinc-500" /> : <File size={14} className="shrink-0 text-zinc-600" />

  return (
    <div
      className="flex items-center gap-1.5 px-1 py-0.5"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {icon}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (value.trim()) onSubmit(value.trim()); else onCancel() }}
        className="flex-1 rounded bg-zinc-800 px-1.5 py-0.5 text-body text-zinc-200 outline-none ring-1 ring-zinc-600 focus:ring-blue-500"
        spellCheck={false}
      />
    </div>
  )
}

function TreeNode({
  node,
  depth,
  projectId,
  treeStateKey,
  cwd,
  onContextMenu,
  inlineInput,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  onFileClick,
  externalActiveFilePath
}: {
  node: FileNode
  depth: number
  projectId: string
  treeStateKey: string
  cwd: string
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  inlineInput: InlineInputState | null
  renamingPath: string | null
  onRenameSubmit: (newName: string) => void
  onRenameCancel: () => void
  onFileClick?: (path: string) => void
  externalActiveFilePath?: string | null
}): React.ReactElement {
  const expandedPaths = useFileTreeStore((s) => s.expandedPerProject[treeStateKey])
  const toggleExpanded = useFileTreeStore((s) => s.toggleExpanded)
  const openFile = useEditorStore((s) => s.openFile)
  const editorActiveFilePath = useEditorStore((s) => s.statePerProject[projectId]?.activeFilePath ?? null)
  const activeFilePath = externalActiveFilePath !== undefined ? externalActiveFilePath : editorActiveFilePath
  const fileStatus = useGitStore((s) => s.statusPerProject[projectId]?.[node.path])
  const isExpanded = expandedPaths?.has(node.path) ?? false
  const statusColor = fileStatus ? GIT_STATUS_COLORS[fileStatus] : ''
  const isRenaming = renamingPath === node.path
  const ignoredStyle = node.isGitignored ? 'opacity-40' : ''

  if (isRenaming) {
    return (
      <InlineInput
        type={node.isDirectory ? 'folder' : 'rename'}
        currentName={node.name}
        onSubmit={onRenameSubmit}
        onCancel={onRenameCancel}
        depth={depth}
      />
    )
  }

  if (!node.isDirectory) {
    const isActive = node.path === activeFilePath
    return (
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-body hover:bg-zinc-800/50 ${ignoredStyle} ${
          isActive ? 'bg-zinc-800/70' : ''
        } ${statusColor || (isActive ? 'text-zinc-200' : 'text-zinc-400')}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() =>
          onFileClick
            ? onFileClick(node.path)
            : openFile(projectId, node.path, node.name, cwd, fileStatus)
        }
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <File size={14} className="shrink-0 text-zinc-600" />
        <span className="flex-1 truncate">{node.name}</span>
        {fileStatus && (
          <span className={`shrink-0 text-micro font-semibold ${statusColor}`}>
            {GIT_STATUS_LABELS[fileStatus]}
          </span>
        )}
      </div>
    )
  }

  const showInlineInput = inlineInput && inlineInput.parentPath === node.path

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-body ${ignoredStyle} ${statusColor || 'text-zinc-300'} hover:bg-zinc-800/50`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => toggleExpanded(treeStateKey, node.path)}
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
      {isExpanded && (
        <>
          {showInlineInput && (
            <InlineInput
              type={inlineInput.type}
              onSubmit={(val) => inlineInput.type === 'rename' ? onRenameSubmit(val) : onRenameSubmit(val)}
              onCancel={onRenameCancel}
              depth={depth + 1}
            />
          )}
          {node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              projectId={projectId}
              treeStateKey={treeStateKey}
              cwd={cwd}
              onContextMenu={onContextMenu}
              inlineInput={inlineInput}
              renamingPath={renamingPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onFileClick={onFileClick}
              externalActiveFilePath={externalActiveFilePath}
            />
          ))}
        </>
      )}
    </div>
  )
}

function FileSearch({ projectId, cwd }: { projectId: string; cwd: string }): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const openFile = useEditorStore((s) => s.openFile)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await window.api.fs.search(cwd, value.trim())
        setResults(res)
      } catch {
        setResults([])
      }
      setSearching(false)
    }, 300)
  }, [cwd])

  const nameResults = results.filter((r) => r.type === 'name')
  const contentResults = results.filter((r) => r.type === 'content')

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/50 px-3">
        <div className="flex w-full items-center gap-2 rounded bg-zinc-800 px-2 py-1">
          <Search size={12} className="shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search files and content..."
            className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            spellCheck={false}
          />
          {query && (
            <button onClick={() => handleSearch('')} className="text-zinc-500 hover:text-zinc-300">
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {searching && <div className="p-3 text-center text-xs text-zinc-600">Searching...</div>}
        {!searching && query && results.length === 0 && (
          <div className="p-3 text-center text-xs text-zinc-600">No results</div>
        )}
        {!searching && !query && (
          <div className="p-3 text-center text-xs text-zinc-600">Type to search by filename or content</div>
        )}
        {nameResults.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-micro font-medium uppercase tracking-wide text-zinc-600">
              Files ({nameResults.length})
            </div>
            {nameResults.map((r) => (
              <button
                key={r.path}
                onClick={() => openFile(projectId, r.path, r.name, cwd)}
                className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-zinc-800/50"
              >
                <File size={12} className="shrink-0 text-zinc-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-zinc-300">{r.name}</div>
                  <div className="truncate text-micro text-zinc-600">{r.relativePath}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {contentResults.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-micro font-medium uppercase tracking-wide text-zinc-600">
              Content ({contentResults.length})
            </div>
            {contentResults.map((r, i) => (
              <button
                key={`${r.path}:${r.line}:${i}`}
                onClick={() => openFile(projectId, r.path, r.name, cwd)}
                className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-zinc-800/50"
              >
                <FileText size={12} className="shrink-0 text-zinc-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs text-zinc-300">{r.name}</span>
                    <span className="shrink-0 text-micro text-zinc-600">:{r.line}</span>
                  </div>
                  <div className="truncate text-micro text-zinc-500">{r.lineContent}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function FileTree({
  projectId,
  rootOverride,
  onFileClick,
  externalActiveFilePath,
}: {
  projectId: string
  rootOverride?: string
  onFileClick?: (path: string) => void
  externalActiveFilePath?: string | null
}): React.ReactElement {
  const activeProject = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)
  )
  const treeKey = rootOverride ?? projectId
  const tree = useFileTreeStore((s) => s.treePerProject[treeKey])
  const showIgnored = useFileTreeStore((s) => s.showIgnoredPerProject[treeKey] ?? true)
  const loadTree = useFileTreeStore((s) => s.loadTree)
  const toggleShowIgnored = useFileTreeStore((s) => s.toggleShowIgnored)
  const toggleExpanded = useFileTreeStore((s) => s.toggleExpanded)
  const loadStatus = useGitStore((s) => s.loadStatus)
  const rootPath = rootOverride ?? activeProject?.path
  const isOverride = Boolean(rootOverride)
  const openDefaultFile = useEditorStore((s) => s.openDefaultFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const defaultFileOpened = useRef(false)

  useEffect(() => {
    if (!rootPath) return
    if (!tree) {
      loadTree(treeKey, rootPath, showIgnored)
    }
  }, [treeKey])

  useEffect(() => {
    if (tree && !defaultFileOpened.current && !isOverride) {
      defaultFileOpened.current = true
      openDefaultFile(projectId, tree)
    }
  }, [tree, projectId, isOverride])

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

  const handleDelete = (filePath: string, name: string, isDirectory: boolean): void => {
    setDeleteConfirm({ path: filePath, name, isDirectory })
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteConfirm || !rootPath) return
    try {
      if (!isOverride) closeFile(projectId, deleteConfirm.path)
      await window.api.fs.deleteFile(deleteConfirm.path)
    } catch (err) {
      console.error('Failed to delete:', err)
    }
    setDeleteConfirm(null)
  }

  const handleNewFile = (parentPath: string): void => {
    toggleExpanded(treeKey, parentPath)
    setInlineInput({ parentPath, type: 'file' })
  }

  const handleNewFolder = (parentPath: string): void => {
    toggleExpanded(treeKey, parentPath)
    setInlineInput({ parentPath, type: 'folder' })
  }

  const handleRename = (filePath: string, _name: string): void => {
    setRenamingPath(filePath)
  }

  const handleDuplicate = async (filePath: string): Promise<void> => {
    try {
      await window.api.fs.duplicate(filePath)
    } catch (err) {
      console.error('Failed to duplicate:', err)
    }
  }

  const handleInlineSubmit = async (value: string): Promise<void> => {
    if (!inlineInput || !rootPath) return
    const fullPath = `${inlineInput.parentPath}/${value}`
    try {
      if (inlineInput.type === 'folder') {
        await window.api.fs.createFolder(fullPath)
      } else {
        await window.api.fs.createFile(fullPath)
      }
    } catch (err) {
      console.error('Failed to create:', err)
    }
    setInlineInput(null)
  }

  const handleRenameSubmit = async (newName: string): Promise<void> => {
    if (!renamingPath || !rootPath) return
    const dir = renamingPath.replace(/\/[^/]+$/, '')
    const newPath = `${dir}/${newName}`
    try {
      if (!isOverride) closeFile(projectId, renamingPath)
      await window.api.fs.rename(renamingPath, newPath)
    } catch (err) {
      console.error('Failed to rename:', err)
    }
    setRenamingPath(null)
  }

  if (!rootPath) {
    return (
      <div className="p-4 text-center text-xs text-zinc-600">Select a project to browse files</div>
    )
  }

  if (showSearch) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3">
          <span className="text-meta font-medium uppercase tracking-wide text-zinc-500">Search</span>
          <button
            onClick={() => setShowSearch(false)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Back to Explorer"
          >
            ×
          </button>
        </div>
        <FileSearch projectId={projectId} cwd={rootPath} />
      </div>
    )
  }

  if (!tree) {
    return <div className="p-4 text-center text-xs text-zinc-600">Loading...</div>
  }

  const handleRefresh = (): void => {
    loadTree(treeKey, rootPath)
    if (!isOverride) loadStatus(projectId, rootPath)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3">
        <span className="text-meta font-medium uppercase tracking-wide text-zinc-500">
          {isOverride ? 'Claude config' : 'Explorer'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowSearch(true)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Search files"
          >
            <Search size={12} />
          </button>
          <button
            onClick={() => handleNewFile(rootPath)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="New file"
          >
            <FilePlus size={12} />
          </button>
          <button
            onClick={() => handleNewFolder(rootPath)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="New folder"
          >
            <FolderPlus size={12} />
          </button>
          <button
            onClick={() => toggleShowIgnored(treeKey, rootPath)}
            className={`rounded p-1 hover:bg-zinc-800 ${showIgnored ? 'text-zinc-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={showIgnored ? 'Hide ignored files' : 'Show ignored files'}
          >
            {showIgnored ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button
            onClick={handleRefresh}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {inlineInput && inlineInput.parentPath === rootPath && (
          <InlineInput
            type={inlineInput.type}
            onSubmit={handleInlineSubmit}
            onCancel={() => setInlineInput(null)}
            depth={0}
          />
        )}
        {tree.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            projectId={projectId}
            treeStateKey={treeKey}
            cwd={rootPath}
            onContextMenu={handleContextMenu}
            inlineInput={inlineInput}
            renamingPath={renamingPath}
            onRenameSubmit={renamingPath ? handleRenameSubmit : handleInlineSubmit}
            onRenameCancel={() => { setRenamingPath(null); setInlineInput(null) }}
            onFileClick={onFileClick}
            externalActiveFilePath={externalActiveFilePath}
          />
        ))}
      </div>
      {contextMenu && (
        <FileContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={handleDelete}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
        />
      )}
      {deleteConfirm && (
        <DeleteConfirm
          name={deleteConfirm.name}
          isDirectory={deleteConfirm.isDirectory}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
