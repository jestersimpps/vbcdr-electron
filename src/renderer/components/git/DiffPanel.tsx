import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DiffEditor, type Monaco } from '@monaco-editor/react'
import { ChevronRight, ChevronDown, Columns2, File, Folder, GitCommit, GitCompareArrows, Rows2, RotateCcw, X } from 'lucide-react'
import { useGitStore } from '@/stores/git-store'
import { useDiffViewStore, type DiffView } from '@/stores/diff-view-store'
import { useThemeStore } from '@/stores/theme-store'
import { useEditorPrefsStore } from '@/stores/editor-prefs-store'
import { registerMonacoThemes, MONACO_THEME_NAME } from '@/config/monaco-theme-registry'
import { GIT_STATUS_COLORS, GIT_STATUS_LABELS } from '@/config/git-status-style'
import type { GitFileStatus } from '@/models/types'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  xml: 'xml',
  svg: 'xml',
  toml: 'ini',
  env: 'ini',
  graphql: 'graphql'
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

interface DiffPanelProps {
  projectId: string
  cwd: string
}

interface ChangedFile {
  absolutePath: string
  name: string
  relativePath: string
  status: GitFileStatus | undefined
}

interface DirNode {
  kind: 'dir'
  name: string
  path: string
  children: TreeNode[]
}

interface FileLeaf {
  kind: 'file'
  file: ChangedFile
}

type TreeNode = DirNode | FileLeaf

function buildTree(files: ChangedFile[]): TreeNode[] {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [] }

  for (const file of files) {
    const segments = file.relativePath.split('/')
    let current = root
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      const segPath = current.path ? `${current.path}/${segment}` : segment
      let child = current.children.find(
        (c): c is DirNode => c.kind === 'dir' && c.name === segment
      )
      if (!child) {
        child = { kind: 'dir', name: segment, path: segPath, children: [] }
        current.children.push(child)
      }
      current = child
    }
    current.children.push({ kind: 'file', file })
  }

  const sortChildren = (node: DirNode): void => {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      const aName = a.kind === 'dir' ? a.name : a.file.name
      const bName = b.kind === 'dir' ? b.name : b.file.name
      return aName.localeCompare(bName)
    })
    for (const child of node.children) {
      if (child.kind === 'dir') sortChildren(child)
    }
  }
  sortChildren(root)

  const collapse = (node: DirNode): DirNode => {
    let current = node
    while (current.children.length === 1 && current.children[0].kind === 'dir') {
      const only = current.children[0] as DirNode
      current = { kind: 'dir', name: `${current.name}/${only.name}`, path: only.path, children: only.children }
    }
    current.children = current.children.map((c) => (c.kind === 'dir' ? collapse(c) : c))
    return current
  }

  return root.children.map((c) => (c.kind === 'dir' ? collapse(c) : c))
}


function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

function toRelative(absolutePath: string, cwd: string): string {
  if (absolutePath.startsWith(cwd)) {
    const rest = absolutePath.slice(cwd.length)
    return rest.startsWith('/') ? rest.slice(1) : rest
  }
  return absolutePath
}

function handleBeforeMount(monaco: Monaco): void {
  registerMonacoThemes(monaco)
}

const WORKING_VIEW: DiffView = { kind: 'working' }

export function DiffPanel({ projectId, cwd }: DiffPanelProps): React.ReactElement {
  const statusMap = useGitStore((s) => s.statusPerProject[projectId])
  const loadStatus = useGitStore((s) => s.loadStatus)
  const storedView = useDiffViewStore((s) => s.viewPerProject[projectId])
  const view: DiffView = storedView ?? WORKING_VIEW
  const showWorking = useDiffViewStore((s) => s.showWorking)
  const fontSize = useEditorPrefsStore((s) => s.fontSize)
  const minimapEnabled = useEditorPrefsStore((s) => s.minimapEnabled)
  const bracketPairColorization = useEditorPrefsStore((s) => s.bracketPairColorization)
  const getFullThemeId = useThemeStore((s) => s.getFullThemeId)
  const themeId = getFullThemeId()
  const monacoTheme = MONACO_THEME_NAME[themeId] ?? 'github-dark'

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [original, setOriginal] = useState<string>('')
  const [modified, setModified] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [isBinary, setIsBinary] = useState(false)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [sideBySide, setSideBySide] = useState(true)
  const [commitFiles, setCommitFiles] = useState<ChangedFile[]>([])

  const toggleDir = (path: string): void => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  useEffect(() => {
    if (view.kind === 'working') {
      void loadStatus(projectId, cwd)
    }
  }, [projectId, cwd, loadStatus, view.kind])

  useEffect(() => {
    if (view.kind !== 'commit') {
      setCommitFiles([])
      return
    }
    let cancelled = false
    window.api.git.commitFiles(cwd, view.hash).then((rows: { path: string; absolutePath: string; status: GitFileStatus }[]) => {
      if (cancelled) return
      setCommitFiles(
        rows.map((r) => ({
          absolutePath: r.absolutePath,
          name: basename(r.absolutePath),
          relativePath: r.path,
          status: r.status
        }))
      )
      setSelectedPath(null)
    })
    return () => {
      cancelled = true
    }
  }, [view, cwd])

  const workingFiles = useMemo<ChangedFile[]>(() => {
    if (!statusMap) return []
    const allPaths = Object.keys(statusMap).filter((p) => p !== cwd)
    const leafPaths = allPaths.filter(
      (p) => !allPaths.some((other) => other !== p && other.startsWith(p + '/'))
    )
    return leafPaths
      .map((absolutePath) => ({
        absolutePath,
        name: basename(absolutePath),
        relativePath: toRelative(absolutePath, cwd),
        status: statusMap[absolutePath]
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  }, [cwd, statusMap])

  const files: ChangedFile[] = view.kind === 'commit' ? commitFiles : workingFiles

  const tree = useMemo(() => buildTree(files), [files])

  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(null)
      return
    }
    if (!selectedPath || !files.some((f) => f.absolutePath === selectedPath)) {
      setSelectedPath(files[0].absolutePath)
    }
  }, [files, selectedPath])

  useEffect(() => {
    if (!selectedPath) {
      setOriginal('')
      setModified('')
      setIsBinary(false)
      return
    }
    const file = files.find((f) => f.absolutePath === selectedPath)
    if (!file) return

    let cancelled = false
    setLoading(true)

    let loadHead: Promise<string>
    let loadCurrent: Promise<{ content: string; isBinary: boolean }>

    if (view.kind === 'commit') {
      const hash = view.hash
      loadHead = file.status === 'added'
        ? Promise.resolve('')
        : window.api.git.fileAtRef(cwd, `${hash}^`, file.absolutePath).then((c) => c ?? '')
      loadCurrent = file.status === 'deleted'
        ? Promise.resolve({ content: '', isBinary: false })
        : window.api.git.fileAtRef(cwd, hash, file.absolutePath).then((c) => ({ content: c ?? '', isBinary: false }))
    } else {
      loadHead = file.status === 'untracked' || file.status === 'added'
        ? Promise.resolve('')
        : window.api.git.fileAtHead(cwd, file.absolutePath).then((c) => c ?? '')
      loadCurrent = file.status === 'deleted'
        ? Promise.resolve({ content: '', isBinary: false })
        : window.api.fs.readFile(file.absolutePath).catch(() => ({ content: '', isBinary: false }))
    }

    Promise.all([loadHead, loadCurrent]).then(([head, current]) => {
      if (cancelled) return
      setIsBinary(current.isBinary)
      setOriginal(head)
      setModified(current.content)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [selectedPath, files, cwd, view])

  const handleRevert = async (file: ChangedFile): Promise<void> => {
    const headContent = await window.api.git.fileAtHead(cwd, file.absolutePath)
    if (headContent === null) return
    await window.api.fs.writeFile(file.absolutePath, headContent)
    await loadStatus(projectId, cwd)
    if (selectedPath === file.absolutePath) {
      setOriginal(headContent)
      setModified(headContent)
    }
  }

  const selectedFile = selectedPath ? files.find((f) => f.absolutePath === selectedPath) : null
  const language = selectedFile ? detectLanguage(selectedFile.name) : 'plaintext'

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.kind === 'dir') {
      const isCollapsed = collapsedDirs.has(node.path)
      return (
        <div key={`dir-${node.path}`}>
          <div
            className="flex cursor-pointer items-center gap-1 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800/40"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => toggleDir(node.path)}
          >
            {isCollapsed ? (
              <ChevronRight size={12} className="shrink-0 text-zinc-500" />
            ) : (
              <ChevronDown size={12} className="shrink-0 text-zinc-500" />
            )}
            <Folder size={12} className="shrink-0 text-zinc-500" />
            <span className="truncate text-[11px]">{node.name}</span>
          </div>
          {!isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      )
    }

    const file = node.file
    const statusColor = file.status ? GIT_STATUS_COLORS[file.status] : 'text-zinc-400'
    const statusLabel = file.status ? GIT_STATUS_LABELS[file.status] : '?'
    const isSelected = selectedPath === file.absolutePath
    return (
      <div
        key={file.absolutePath}
        className={`group flex items-center gap-1.5 px-2 py-0.5 ${
          isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/40'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <File size={12} className="shrink-0 text-zinc-600" />
        <button
          onClick={() => setSelectedPath(file.absolutePath)}
          className={`min-w-0 flex-1 truncate text-left text-[11px] ${statusColor}`}
          title={file.relativePath}
        >
          {file.name}
        </button>
        <span className={`shrink-0 w-3 text-center text-[10px] font-semibold tabular-nums ${statusColor}`}>
          {statusLabel}
        </span>
        {view.kind === 'working' && (
          <button
            onClick={() => handleRevert(file)}
            className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-red-400"
            title="Revert to HEAD"
          >
            <RotateCcw size={10} />
          </button>
        )}
      </div>
    )
  }

  const isCommitView = view.kind === 'commit'
  const headerIcon = isCommitView ? (
    <GitCommit size={12} className="text-blue-400" />
  ) : (
    <GitCompareArrows size={12} className="text-emerald-400" />
  )
  const headerLabel = isCommitView ? view.shortHash : 'Changes since HEAD'
  const headerTitle = isCommitView ? view.message : undefined
  const emptyMessage = isCommitView ? 'No files in this commit' : 'No changes since last commit'

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={25} minSize={15} maxSize={50}>
        <div className="flex h-full flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-1.5 border-b border-zinc-800 px-2 py-1.5">
            {headerIcon}
            <span className="min-w-0 truncate text-[11px] text-zinc-300" title={headerTitle}>
              {headerLabel}
            </span>
            {files.length > 0 && (
              <span className={`ml-auto shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${
                isCommitView ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
              }`}>
                {files.length}
              </span>
            )}
            {isCommitView && (
              <button
                onClick={() => showWorking(projectId)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                title="Back to working changes"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {isCommitView && view.message && (
            <div className="border-b border-zinc-800 px-2 py-1 text-[10px] leading-snug text-zinc-400" title={view.message}>
              {view.message}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {files.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-600">{emptyMessage}</div>
            ) : (
              tree.map((node) => renderNode(node, 0))
            )}
          </div>
        </div>
      </Panel>
      <PanelResizeHandle className="w-1 bg-zinc-800 transition-colors hover:bg-zinc-700" />
      <Panel defaultSize={75} minSize={30}>
        <div className="flex h-full min-w-0 flex-col bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <span className="min-w-0 truncate text-[11px] text-zinc-400" title={selectedFile?.relativePath}>
            {selectedFile?.relativePath ?? ''}
          </span>
          <div className="flex shrink-0 items-center gap-0.5 rounded border border-zinc-800 bg-zinc-950 p-0.5">
            <button
              onClick={() => setSideBySide(true)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                sideBySide ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Side-by-side diff"
            >
              <Columns2 size={11} />
              Split
            </button>
            <button
              onClick={() => setSideBySide(false)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                !sideBySide ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Inline diff"
            >
              <Rows2 size={11} />
              Inline
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {!selectedFile ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              {files.length === 0 ? emptyMessage : 'Select a file to see the diff'}
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">Loading diff…</div>
          ) : isBinary ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              Binary file, diff not shown
            </div>
          ) : (
            <DiffEditor
              key={`diff-${selectedFile.absolutePath}`}
              original={original}
              modified={modified}
              language={language}
              theme={monacoTheme}
              beforeMount={handleBeforeMount}
              options={{
                readOnly: true,
                originalEditable: false,
                renderSideBySide: sideBySide,
                minimap: { enabled: minimapEnabled },
                fontSize,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                bracketPairColorization: { enabled: bracketPairColorization }
              }}
            />
          )}
        </div>
        </div>
      </Panel>
    </PanelGroup>
  )
}
