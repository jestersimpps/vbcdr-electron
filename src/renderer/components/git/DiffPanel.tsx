import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DiffEditor, type Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { ChevronLeft, ChevronRight, ChevronDown, CloudDownload, CloudUpload, Columns2, File, Folder, GitCommit, GitCompareArrows, Loader2, MessageSquareText, Play, Rows2, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { useGitStore } from '@/stores/git-store'
import { useDiffViewStore, type DiffView } from '@/stores/diff-view-store'
import { useThemeStore } from '@/stores/theme-store'
import { useEditorPrefsStore } from '@/stores/editor-prefs-store'
import { useEditorStore } from '@/stores/editor-store'
import { registerMonacoThemes, MONACO_THEME_NAME } from '@/config/monaco-theme-registry'
import { GIT_STATUS_COLORS, GIT_STATUS_LABELS } from '@/config/git-status-style'
import type { GitFileStatus } from '@/models/types'
import {
  FileContextMenu,
  DeleteConfirm,
  NameDialog,
  type ContextMenuTarget
} from '@/components/sidebar/FileContextMenu'
import { MonacoErrorBoundary } from '@/components/editor/MonacoErrorBoundary'

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

interface DiffComment {
  line: number
  side: 'old' | 'new'
  text: string
}

interface FileAnnotation {
  path: string
  summary?: string
  comments: DiffComment[]
}

interface FlatComment extends DiffComment {
  filePath: string
  fileSummary?: string
  indexInFile: number
  isSummary?: boolean
}

type ExplainLevel = 'functional' | 'technical' | 'deep'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;'
    if (c === '<') return '&lt;'
    if (c === '>') return '&gt;'
    if (c === '"') return '&quot;'
    return '&#39;'
  })
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
  const defaultDiffView = useEditorPrefsStore((s) => s.defaultDiffView)
  const getFullThemeId = useThemeStore((s) => s.getFullThemeId)
  const themeId = getFullThemeId()
  const monacoTheme = MONACO_THEME_NAME[themeId] ?? 'github-dark'

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [original, setOriginal] = useState<string>('')
  const [modified, setModified] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [isBinary, setIsBinary] = useState(false)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [sideBySide, setSideBySide] = useState(defaultDiffView === 'split')
  const [commitFiles, setCommitFiles] = useState<ChangedFile[]>([])
  const [numstat, setNumstat] = useState<Record<string, { additions: number; deletions: number }>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const [nameDialog, setNameDialog] = useState<
    | { kind: 'newFile' | 'newFolder'; parentPath: string }
    | { kind: 'rename'; path: string; name: string }
    | null
  >(null)
  const closeFile = useEditorStore((s) => s.closeFile)

  const selectedRowRef = useRef<HTMLDivElement | null>(null)

  const [annotations, setAnnotations] = useState<Record<string, FileAnnotation>>({})
  const [explainLevel, setExplainLevel] = useState<ExplainLevel | null>(null)
  const [loadingLevel, setLoadingLevel] = useState<ExplainLevel | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [highlightedCommentKey, setHighlightedCommentKey] = useState<string | null>(null)
  const [tourPlaying, setTourPlaying] = useState(false)
  const [tourIndex, setTourIndex] = useState(-1)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const tourCancelledRef = useRef(false)
  const diffEditorRef = useRef<MonacoEditorNS.IStandaloneDiffEditor | null>(null)
  const viewZoneIdsRef = useRef<{ original: string[]; modified: string[] }>({ original: [], modified: [] })
  const decorationsRef = useRef<{ original: string[]; modified: string[] }>({ original: [], modified: [] })
  const panelRootRef = useRef<HTMLDivElement | null>(null)
  const pendingRevealRef = useRef<{ line: number; side: 'old' | 'new' } | null>(null)

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
    if (view.kind === 'working') {
      setCommitFiles([])
      return
    }
    let cancelled = false
    const loader =
      view.kind === 'commit'
        ? window.api.git.commitFiles(cwd, view.hash)
        : window.api.git.rangeFiles(cwd, view.from, view.to)
    loader.then((rows: { path: string; absolutePath: string; status: GitFileStatus }[]) => {
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

  useEffect(() => {
    let cancelled = false
    const loader =
      view.kind === 'commit'
        ? window.api.git.diffNumstat(cwd, view.hash)
        : view.kind === 'incoming' || view.kind === 'outgoing'
        ? window.api.git.rangeNumstat(cwd, view.from, view.to)
        : window.api.git.diffNumstat(cwd, undefined)
    loader.then((rows) => {
      if (!cancelled) setNumstat(rows)
    })
    return () => {
      cancelled = true
    }
  }, [view, cwd, statusMap])

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

  const files: ChangedFile[] = view.kind === 'working' ? workingFiles : commitFiles

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
      setLoadedPath(null)
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
    } else if (view.kind === 'incoming' || view.kind === 'outgoing') {
      const fromRef = view.from
      const toRef = view.to
      loadHead = file.status === 'added'
        ? Promise.resolve('')
        : window.api.git.fileAtRef(cwd, fromRef, file.absolutePath).then((c) => c ?? '')
      loadCurrent = file.status === 'deleted'
        ? Promise.resolve({ content: '', isBinary: false })
        : window.api.git.fileAtRef(cwd, toRef, file.absolutePath).then((c) => ({ content: c ?? '', isBinary: false }))
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
      setLoadedPath(file.absolutePath)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [selectedPath, files, cwd, view])

  const flatComments = useMemo<FlatComment[]>(() => {
    const out: FlatComment[] = []
    for (const file of files) {
      const ann = annotations[file.relativePath]
      if (!ann) continue
      ann.comments.forEach((c, i) => {
        out.push({ ...c, filePath: file.relativePath, fileSummary: ann.summary, indexInFile: i })
      })
    }
    return out
  }, [files, annotations])

  useEffect(() => {
    if (currentCommentIndex >= flatComments.length) {
      setCurrentCommentIndex(0)
    }
  }, [flatComments.length, currentCommentIndex])

  useEffect(() => {
    setAnnotations({})
    setExplainLevel(null)
    setExplainError(null)
    setCurrentCommentIndex(0)
    tourCancelledRef.current = true
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setTourPlaying(false)
    setTourIndex(-1)
  }, [view])

  const goToComment = useCallback(
    (index: number): void => {
      if (index < 0 || index >= flatComments.length) return
      const c = flatComments[index]
      setCurrentCommentIndex(index)
      const target = files.find((f) => f.relativePath === c.filePath)
      const key = c.isSummary
        ? `${c.filePath}:summary`
        : `${c.filePath}:${c.indexInFile}:${c.side}:${c.line}`
      setHighlightedCommentKey(key)
      pendingRevealRef.current = { line: c.line, side: c.side }
      if (target && target.absolutePath !== selectedPath) {
        setSelectedPath(target.absolutePath)
        return
      }
      const editor = diffEditorRef.current
      if (editor && target) {
        const sub = c.side === 'old' ? editor.getOriginalEditor() : editor.getModifiedEditor()
        sub.revealLineInCenter(c.line)
        pendingRevealRef.current = null
      }
    },
    [flatComments, files, selectedPath]
  )

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve()
        return
      }
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.05
      u.pitch = 1
      utteranceRef.current = u
      const onEnd = (): void => {
        utteranceRef.current = null
        resolve()
      }
      u.onend = onEnd
      u.onerror = onEnd
      window.speechSynthesis.speak(u)
    })
  }, [])

  const stopTour = useCallback((): void => {
    tourCancelledRef.current = true
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
    setTourPlaying(false)
    setTourIndex(-1)
  }, [])

  const startTour = useCallback(async (startAt: number = 0): Promise<void> => {
    if (flatComments.length === 0) return
    tourCancelledRef.current = false
    setTourPlaying(true)
    for (let i = startAt; i < flatComments.length; i++) {
      if (tourCancelledRef.current) break
      setTourIndex(i)
      goToComment(i)
      // Tiny delay so the line scroll/highlight visibly precedes the audio.
      await new Promise((r) => setTimeout(r, 350))
      if (tourCancelledRef.current) break
      await speak(flatComments[i].text)
      if (tourCancelledRef.current) break
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!tourCancelledRef.current) {
      setTourPlaying(false)
      setTourIndex(-1)
    }
  }, [flatComments, goToComment, speak])

  useEffect(() => {
    return () => {
      // On unmount, cancel any in-flight speech to avoid the synth talking after the panel closes.
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const handleExplain = useCallback(async (level: ExplainLevel): Promise<void> => {
    setExplainError(null)
    setLoadingLevel(level)
    try {
      const source =
        view.kind === 'commit'
          ? { kind: 'commit' as const, hash: view.hash }
          : view.kind === 'incoming' || view.kind === 'outgoing'
          ? { kind: 'range' as const, from: view.from, to: view.to }
          : { kind: 'working' as const }
      const result = await window.api.claude.explainDiff(cwd, source, level)
      const map: Record<string, FileAnnotation> = {}
      for (const f of result.files) {
        map[f.path] = f
      }
      setAnnotations(map)
      setExplainLevel(result.level ?? level)
      setCurrentCommentIndex(0)
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'Failed to explain changes')
    } finally {
      setLoadingLevel(null)
    }
  }, [cwd, view])

  const clearViewZonesAndDecorations = useCallback((): void => {
    const editor = diffEditorRef.current
    if (!editor) return
    try {
      const original = editor.getOriginalEditor()
      const modified = editor.getModifiedEditor()
      if (!original.getModel() || !modified.getModel()) return
      original.changeViewZones((accessor) => {
        for (const id of viewZoneIdsRef.current.original) accessor.removeZone(id)
      })
      modified.changeViewZones((accessor) => {
        for (const id of viewZoneIdsRef.current.modified) accessor.removeZone(id)
      })
      viewZoneIdsRef.current = { original: [], modified: [] }
      decorationsRef.current.original = original.deltaDecorations(decorationsRef.current.original, [])
      decorationsRef.current.modified = modified.deltaDecorations(decorationsRef.current.modified, [])
    } catch {
      viewZoneIdsRef.current = { original: [], modified: [] }
      decorationsRef.current = { original: [], modified: [] }
    }
  }, [])

  useEffect(() => {
    const editor = diffEditorRef.current
    if (!editor || loadedPath !== selectedPath || !selectedFileRef()) {
      return
    }

    const original = editor.getOriginalEditor()
    const modified = editor.getModifiedEditor()
    if (!original.getModel() || !modified.getModel()) return

    clearViewZonesAndDecorations()

    const file = files.find((f) => f.absolutePath === selectedPath)
    if (!file) return
    const ann = annotations[file.relativePath]
    if (!ann || ann.comments.length === 0) return

    const newDecos: { original: MonacoEditorNS.IModelDeltaDecoration[]; modified: MonacoEditorNS.IModelDeltaDecoration[] } = {
      original: [],
      modified: []
    }

    const globalIndexByKey: Record<string, number> = {}
    flatComments.forEach((fc, gi) => {
      const k = `${fc.filePath}:${fc.indexInFile}:${fc.side}:${fc.line}`
      globalIndexByKey[k] = gi
    })

    ann.comments.forEach((c, i) => {
      const sub = c.side === 'old' ? original : modified
      const target = c.side === 'old' ? 'original' : 'modified'
      const key = `${file.relativePath}:${i}:${c.side}:${c.line}`
      const globalIndex = globalIndexByKey[key] ?? -1
      const badgeNumber = globalIndex >= 0 ? globalIndex + 1 : i + 1
      const node = document.createElement('div')
      const isHighlighted = highlightedCommentKey === key
      node.className = `vbcdr-explain-bubble${isHighlighted ? ' vbcdr-explain-bubble--active' : ''}`
      node.innerHTML = `<div class="vbcdr-explain-bubble__inner"><span class="vbcdr-explain-bubble__badge">${badgeNumber}</span><span class="vbcdr-explain-bubble__text">${escapeHtml(c.text)}</span></div>`

      sub.changeViewZones((accessor) => {
        const id = accessor.addZone({
          afterLineNumber: c.line,
          heightInLines: Math.max(1, Math.ceil(c.text.length / 110)),
          domNode: node
        })
        viewZoneIdsRef.current[target].push(id)
      })

      newDecos[target].push({
        range: { startLineNumber: c.line, startColumn: 1, endLineNumber: c.line, endColumn: 1 },
        options: {
          isWholeLine: true,
          linesDecorationsClassName: `vbcdr-explain-pin vbcdr-explain-pin-${badgeNumber}${isHighlighted ? ' vbcdr-explain-pin--active' : ''}${tourPlaying && tourIndex === globalIndex ? ' vbcdr-explain-pin--tour' : ''}`,
          className: tourPlaying && tourIndex === globalIndex ? 'vbcdr-explain-line-tour' : undefined
        }
      })
    })

    decorationsRef.current.original = original.deltaDecorations(decorationsRef.current.original, newDecos.original)
    decorationsRef.current.modified = modified.deltaDecorations(decorationsRef.current.modified, newDecos.modified)

    const pending = pendingRevealRef.current
    if (pending) {
      const sub = pending.side === 'old' ? original : modified
      sub.revealLineInCenter(pending.line)
      pendingRevealRef.current = null
    }

    return () => {
      // Cleanup runs when deps change; clearViewZonesAndDecorations at top of next run handles it.
    }
  }, [annotations, selectedPath, loadedPath, files, highlightedCommentKey, clearViewZonesAndDecorations, flatComments, tourPlaying, tourIndex])

  function selectedFileRef(): ChangedFile | null {
    return selectedPath ? (files.find((f) => f.absolutePath === selectedPath) ?? null) : null
  }

  useEffect(() => {
    if (!highlightedCommentKey) return
    const t = setTimeout(() => setHighlightedCommentKey(null), 1800)
    return () => clearTimeout(t)
  }, [highlightedCommentKey])

  useEffect(() => {
    const node = panelRootRef.current
    if (!node) return
    const onKey = (e: KeyboardEvent): void => {
      if (flatComments.length === 0) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ']' || e.key === 'j') {
        e.preventDefault()
        goToComment(Math.min(flatComments.length - 1, currentCommentIndex + 1))
      } else if (e.key === '[' || e.key === 'k') {
        e.preventDefault()
        goToComment(Math.max(0, currentCommentIndex - 1))
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [flatComments.length, currentCommentIndex, goToComment])

  const handleEditorMount = useCallback((editor: MonacoEditorNS.IStandaloneDiffEditor): void => {
    diffEditorRef.current = editor
    editor.onDidDispose(() => {
      if (diffEditorRef.current === editor) {
        diffEditorRef.current = null
        viewZoneIdsRef.current = { original: [], modified: [] }
        decorationsRef.current = { original: [], modified: [] }
      }
    })
    const pending = pendingRevealRef.current
    if (pending) {
      const sub = pending.side === 'old' ? editor.getOriginalEditor() : editor.getModifiedEditor()
      sub.revealLineInCenter(pending.line)
    }
  }, [])

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDirectory: boolean): void => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDirectory })
  }

  const handleDelete = (filePath: string, name: string, isDirectory: boolean): void => {
    setDeleteConfirm({ path: filePath, name, isDirectory })
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteConfirm) return
    try {
      closeFile(projectId, deleteConfirm.path)
      await window.api.fs.deleteFile(deleteConfirm.path)
      await loadStatus(projectId, cwd)
    } catch (err) {
      console.error('Failed to delete:', err)
    }
    setDeleteConfirm(null)
  }

  const handleDuplicate = async (filePath: string): Promise<void> => {
    try {
      await window.api.fs.duplicate(filePath)
      await loadStatus(projectId, cwd)
    } catch (err) {
      console.error('Failed to duplicate:', err)
    }
  }

  const handleNameDialogSubmit = async (value: string): Promise<void> => {
    const dialog = nameDialog
    if (!dialog) return
    try {
      switch (dialog.kind) {
        case 'newFile':
          await window.api.fs.createFile(`${dialog.parentPath}/${value}`)
          break
        case 'newFolder':
          await window.api.fs.createFolder(`${dialog.parentPath}/${value}`)
          break
        case 'rename': {
          const dir = dialog.path.replace(/\/[^/]+$/, '')
          const newPath = `${dir}/${value}`
          closeFile(projectId, dialog.path)
          await window.api.fs.rename(dialog.path, newPath)
          break
        }
      }
      await loadStatus(projectId, cwd)
    } catch (err) {
      console.error('Failed to apply file action:', err)
    }
    setNameDialog(null)
  }

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

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedPath])

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.kind === 'dir') {
      const isCollapsed = collapsedDirs.has(node.path)
      const absoluteDirPath = `${cwd}/${node.path}`
      return (
        <div key={`dir-${node.path}`}>
          <div
            className="flex cursor-pointer items-center gap-1.5 px-1 py-0.5 text-zinc-400 hover:bg-zinc-800/40"
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={() => toggleDir(node.path)}
            onContextMenu={(e) => handleContextMenu(e, absoluteDirPath, node.name, true)}
          >
            {isCollapsed ? (
              <ChevronRight size={14} className="shrink-0 text-zinc-500" />
            ) : (
              <ChevronDown size={14} className="shrink-0 text-zinc-500" />
            )}
            <Folder size={14} className="shrink-0 text-zinc-500" />
            <span className="truncate text-body">{node.name}</span>
          </div>
          {!isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      )
    }

    const file = node.file
    const statusColor = file.status ? GIT_STATUS_COLORS[file.status] : 'text-zinc-400'
    const statusLabel = file.status ? GIT_STATUS_LABELS[file.status] : '?'
    const isSelected = selectedPath === file.absolutePath
    const stat = numstat[file.absolutePath]
    return (
      <div
        key={file.absolutePath}
        ref={isSelected ? selectedRowRef : undefined}
        className={`group flex cursor-pointer items-center gap-1.5 border-l-2 px-1 py-0.5 ${
          isSelected
            ? 'border-l-blue-500 bg-zinc-700/80 text-zinc-100'
            : 'border-l-transparent hover:bg-zinc-800/40'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => setSelectedPath(file.absolutePath)}
        onContextMenu={(e) => handleContextMenu(e, file.absolutePath, file.name, false)}
        title={file.relativePath}
      >
        <File size={14} className="shrink-0 text-zinc-600" />
        <span className={`min-w-0 flex-1 truncate text-left text-body ${statusColor}`}>
          {file.name}
        </span>
        {stat && (stat.additions > 0 || stat.deletions > 0) && (
          <span className="shrink-0 flex items-center gap-1 text-micro tabular-nums">
            {stat.additions > 0 && (
              <span className="text-emerald-400">+{stat.additions}</span>
            )}
            {stat.deletions > 0 && (
              <span className="text-red-400">−{stat.deletions}</span>
            )}
          </span>
        )}
        <span className={`shrink-0 w-3 text-center text-micro font-semibold tabular-nums ${statusColor}`}>
          {statusLabel}
        </span>
        {view.kind === 'working' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleRevert(file)
            }}
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
  const isIncomingView = view.kind === 'incoming'
  const isOutgoingView = view.kind === 'outgoing'
  const isAlternateView = isCommitView || isIncomingView || isOutgoingView
  const headerIcon = isCommitView ? (
    <GitCommit size={12} className="text-blue-400" />
  ) : isIncomingView ? (
    <CloudDownload size={12} className="text-blue-400" />
  ) : isOutgoingView ? (
    <CloudUpload size={12} className="text-emerald-400" />
  ) : (
    <GitCompareArrows size={12} className="text-yellow-400" />
  )
  const headerLabel =
    view.kind === 'commit'
      ? view.shortHash
      : view.kind === 'incoming'
      ? `Incoming from ${view.to}`
      : view.kind === 'outgoing'
      ? `Local work to ${view.from}`
      : 'Changes since HEAD'
  const headerTitle =
    view.kind === 'commit'
      ? view.message
      : view.kind === 'incoming' || view.kind === 'outgoing'
      ? `${view.count} commit${view.count === 1 ? '' : 's'}`
      : undefined
  const emptyMessage = isIncomingView
    ? 'No incoming changes'
    : isOutgoingView
    ? 'No local-only changes'
    : isCommitView
    ? 'No files in this commit'
    : 'No changes since last commit'

  return (
    <>
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={25} minSize={15} maxSize={50}>
        <div className="flex h-full flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900">
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-zinc-800 px-2">
            {headerIcon}
            <span className="min-w-0 truncate text-meta text-zinc-300" title={headerTitle}>
              {headerLabel}
            </span>
            {files.length > 0 && (
              <span className={`ml-auto shrink-0 rounded px-1.5 py-px text-micro font-medium ${
                isCommitView || isIncomingView
                  ? 'bg-blue-500/15 text-blue-400'
                  : isOutgoingView
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-yellow-500/15 text-yellow-400'
              }`}>
                {files.length}
              </span>
            )}
            {isAlternateView && (
              <button
                onClick={() => showWorking(projectId)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                title="Back to working changes"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {view.kind === 'commit' && view.message && (
            <div className="border-b border-zinc-800 px-2 py-1 text-micro leading-snug text-zinc-400" title={view.message}>
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
        <div className="flex h-full min-w-0 flex-col bg-zinc-950" ref={panelRootRef} tabIndex={-1}>
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2">
          <span className="min-w-0 truncate text-meta text-zinc-400" title={selectedFile?.relativePath}>
            {selectedFile?.relativePath ?? ''}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {flatComments.length > 0 ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={tourPlaying ? stopTour : () => startTour(Math.max(0, currentCommentIndex))}
                    className={`flex items-center gap-1 rounded border px-2 py-1 text-micro ${
                      tourPlaying
                        ? 'border-blue-500/60 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                    }`}
                    title={tourPlaying ? 'Stop tour' : 'Play tour: walks through each comment with audio'}
                  >
                    {tourPlaying ? <Square size={10} className="fill-current" /> : <Play size={10} className="fill-current" />}
                    {tourPlaying ? 'Stop' : 'Play tour'}
                  </button>
                  <button
                    onClick={() => goToComment(currentCommentIndex - 1)}
                    disabled={currentCommentIndex <= 0 || tourPlaying}
                    className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-micro text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Previous comment ([)"
                  >
                    <ChevronLeft size={11} />
                    Prev
                  </button>
                  <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-micro tabular-nums text-zinc-400">
                    <MessageSquareText size={10} className="mr-1 inline -mt-px text-blue-400" />
                    {currentCommentIndex + 1}/{flatComments.length}
                  </span>
                  <button
                    onClick={() => goToComment(currentCommentIndex + 1)}
                    disabled={currentCommentIndex >= flatComments.length - 1 || tourPlaying}
                    className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-micro text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Next comment (])"
                  >
                    Next
                    <ChevronRight size={11} />
                  </button>
                  <button
                    onClick={() => { stopTour(); setAnnotations({}); setExplainLevel(null); setExplainError(null) }}
                    className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                    title="Clear comments"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 rounded border border-zinc-800 bg-zinc-950 p-0.5">
                  {(['functional', 'technical', 'deep'] as const).map((lvl) => {
                    const label = lvl === 'functional' ? 'Functional' : lvl === 'technical' ? 'Technical' : 'Deep'
                    const tooltip =
                      lvl === 'functional'
                        ? 'Plain-language summary for non-developers'
                        : lvl === 'technical'
                        ? 'Architectural summary: design choices and trade-offs'
                        : 'Line-by-line explanation'
                    const isLoading = loadingLevel === lvl
                    return (
                      <button
                        key={lvl}
                        onClick={() => handleExplain(lvl)}
                        disabled={loadingLevel !== null || files.length === 0}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-micro text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={tooltip}
                      >
                        {isLoading
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Sparkles size={11} className="text-blue-400" />}
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            {explainError && loadingLevel === null && (
              <span className="max-w-[240px] truncate text-micro text-red-400" title={explainError}>
                {explainError}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5 rounded border border-zinc-800 bg-zinc-950 p-0.5">
              <button
                onClick={() => setSideBySide(true)}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-micro ${
                  sideBySide ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Side-by-side diff"
              >
                <Columns2 size={11} />
                Split
              </button>
              <button
                onClick={() => setSideBySide(false)}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-micro ${
                  !sideBySide ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Inline diff"
              >
                <Rows2 size={11} />
                Inline
              </button>
            </div>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {!selectedFile ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              {files.length === 0 ? emptyMessage : 'Select a file to see the diff'}
            </div>
          ) : isBinary && loadedPath === selectedPath ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              Binary file, diff not shown
            </div>
          ) : loadedPath !== selectedPath ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              {loading ? 'Loading diff…' : ''}
            </div>
          ) : (
            <MonacoErrorBoundary
              onRecover={() => {
                diffEditorRef.current = null
                viewZoneIdsRef.current = { original: [], modified: [] }
                decorationsRef.current = { original: [], modified: [] }
              }}
            >
              <DiffEditor
                key={`diff-${loadedPath}`}
                original={original}
                modified={modified}
                language={language}
                theme={monacoTheme}
                beforeMount={handleBeforeMount}
                onMount={handleEditorMount}
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
            </MonacoErrorBoundary>
          )}
        </div>
        </div>
      </Panel>
    </PanelGroup>
    {contextMenu && (
      <FileContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onDelete={handleDelete}
        onNewFile={(parentPath) => setNameDialog({ kind: 'newFile', parentPath })}
        onNewFolder={(parentPath) => setNameDialog({ kind: 'newFolder', parentPath })}
        onRename={(path, name) => setNameDialog({ kind: 'rename', path, name })}
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
    {nameDialog && (
      <NameDialog
        title={
          nameDialog.kind === 'rename'
            ? `Rename ${nameDialog.name}`
            : nameDialog.kind === 'newFolder'
            ? 'New folder'
            : 'New file'
        }
        initialValue={nameDialog.kind === 'rename' ? nameDialog.name : ''}
        submitLabel={nameDialog.kind === 'rename' ? 'Rename' : 'Create'}
        onSubmit={handleNameDialogSubmit}
        onCancel={() => setNameDialog(null)}
      />
    )}
    </>
  )
}
