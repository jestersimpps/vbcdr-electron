import { useEffect, useState, useRef, useCallback } from 'react'
import Editor, { DiffEditor, type Monaco } from '@monaco-editor/react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditorStore } from '@/stores/editor-store'
import { useEditorPrefsStore } from '@/stores/editor-prefs-store'
import { useThemeStore } from '@/stores/theme-store'
import { registerMonacoThemes, MONACO_THEME_NAME } from '@/config/monaco-theme-registry'
import { MonacoErrorBoundary } from '@/components/editor/MonacoErrorBoundary'
import { GIT_STATUS_COLORS, GIT_STATUS_LABELS } from '@/config/git-status-style'
import { useGitStore } from '@/stores/git-store'
import { X, FileWarning, Circle } from 'lucide-react'
import type { OpenFile, GitFileStatus } from '@/models/types'
import type { editor } from 'monaco-editor'

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

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'])

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif'
}

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  webm: 'audio/webm',
  aiff: 'audio/aiff',
  aif: 'audio/aiff'
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

function getFileExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

function PdfPreview({ file }: { file: OpenFile }): React.ReactElement {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file.content) return
    const blob = new Blob([base64ToArrayBuffer(file.content)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file.content])

  if (!blobUrl) return <DocLoading label="Loading PDF…" />

  return (
    <iframe
      src={blobUrl}
      title={file.name}
      className="h-full w-full border-0"
    />
  )
}

function DocxPreview({ file }: { file: OpenFile }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file.content) return
    let cancelled = false
    import('mammoth/mammoth.browser').then((mammoth) =>
      mammoth.convertToHtml({ arrayBuffer: base64ToArrayBuffer(file.content) })
    ).then((result) => {
      if (!cancelled) setHtml(result.value)
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message)
    })
    return () => { cancelled = true }
  }, [file.content])

  if (error) return <DocError message={error} />
  if (!html) return <DocLoading label="Loading document…" />

  return (
    <div className="absolute inset-0 overflow-auto bg-white">
      <div className="mx-auto max-w-3xl px-12 py-10">
        <div
          className="docx-preview text-sm leading-relaxed text-zinc-900
            [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-zinc-900
            [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900
            [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-800
            [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-medium [&_h4]:text-zinc-800
            [&_p]:mb-3 [&_p]:leading-relaxed
            [&_ul]:mb-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1
            [&_ol]:mb-3 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-1
            [&_li]:leading-relaxed
            [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse
            [&_td]:border [&_td]:border-zinc-300 [&_td]:px-3 [&_td]:py-2
            [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium
            [&_a]:text-blue-600 [&_a]:underline
            [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-600
            [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded
            [&_strong]:font-semibold
            [&_em]:italic"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

function SpreadsheetPreview({ file }: { file: OpenFile }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const workbookRef = useRef<ReturnType<typeof import('xlsx').read> | null>(null)

  useEffect(() => {
    if (!file.content) return
    let cancelled = false
    import('xlsx').then((XLSX) => {
      const wb = XLSX.read(base64ToArrayBuffer(file.content), { type: 'array' })
      if (cancelled) return
      workbookRef.current = wb
      setSheets(wb.SheetNames)
      setActiveSheet(0)
      const ws = wb.Sheets[wb.SheetNames[0]]
      setHtml(XLSX.utils.sheet_to_html(ws))
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message)
    })
    return () => { cancelled = true }
  }, [file.content])

  const switchSheet = useCallback((idx: number) => {
    if (!workbookRef.current) return
    import('xlsx').then((XLSX) => {
      const wb = workbookRef.current!
      const ws = wb.Sheets[wb.SheetNames[idx]]
      setHtml(XLSX.utils.sheet_to_html(ws))
      setActiveSheet(idx)
    })
  }, [])

  if (error) return <DocError message={error} />
  if (!html) return <DocLoading label="Loading spreadsheet…" />

  return (
    <div className="flex h-full flex-col bg-white">
      {sheets.length > 1 && (
        <div className="flex gap-0 border-b border-zinc-300 bg-zinc-100">
          {sheets.map((name, i) => (
            <button
              key={name}
              className={`px-3 py-1.5 text-xs ${
                i === activeSheet
                  ? 'bg-white text-zinc-900 border-b-2 border-blue-500'
                  : 'text-zinc-500 hover:bg-zinc-200'
              }`}
              onClick={() => switchSheet(i)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        <div
          className="spreadsheet-preview text-xs text-black [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

function AudioPreview({ file }: { file: OpenFile }): React.ReactElement {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const ext = getFileExt(file.name)
  const mime = AUDIO_MIME[ext] ?? 'audio/mpeg'

  useEffect(() => {
    if (!file.content) return
    const blob = new Blob([base64ToArrayBuffer(file.content)], { type: mime })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file.content, mime])

  if (!blobUrl) return <DocLoading label="Loading audio…" />

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 p-8">
      <span className="text-sm text-zinc-400">{file.name}</span>
      <audio controls src={blobUrl} className="w-full max-w-md" />
    </div>
  )
}

function DocLoading({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      {label}
    </div>
  )
}

function DocError({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
      <FileWarning size={48} strokeWidth={1} />
      <span className="text-sm">Failed to load: {message}</span>
    </div>
  )
}

const OFFICE_PREVIEWS: Record<string, React.ComponentType<{ file: OpenFile }>> = {
  pdf: PdfPreview,
  docx: DocxPreview,
  xlsx: SpreadsheetPreview,
  xls: SpreadsheetPreview
}

function BinaryPreview({ file }: { file: OpenFile }): React.ReactElement {
  const ext = getFileExt(file.name)

  if (ext === 'svg') {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 p-8">
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(file.content)}`}
          alt={file.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (IMAGE_EXTS.has(ext)) {
    const mime = MIME_MAP[ext] ?? 'image/png'
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 p-8">
        <img
          src={`data:${mime};base64,${file.content}`}
          alt={file.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  const OfficePreview = OFFICE_PREVIEWS[ext]
  if (OfficePreview && file.content) {
    return <OfficePreview file={file} />
  }

  if (AUDIO_MIME[ext] && file.content) {
    return <AudioPreview file={file} />
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
      <FileWarning size={48} strokeWidth={1} />
      <span className="text-sm">Binary file — cannot display</span>
    </div>
  )
}

function handleBeforeMount(monaco: Monaco): void {
  registerMonacoThemes(monaco)
}

function SortableTab({
  file,
  isActive,
  gitStatus,
  onSelect,
  onClose
}: {
  file: OpenFile
  isActive: boolean
  gitStatus?: GitFileStatus
  onSelect: () => void
  onClose: (e: React.MouseEvent) => void
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.path })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined
  }
  const statusColor = gitStatus ? GIT_STATUS_COLORS[gitStatus] : ''
  const statusLabel = gitStatus ? GIT_STATUS_LABELS[gitStatus] : null
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-zinc-800 px-3 text-xs ${
        isActive
          ? 'bg-zinc-950 text-zinc-200'
          : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
      }`}
      onClick={onSelect}
    >
      <span className={`truncate max-w-[120px] ${statusColor}`}>{file.name}</span>
      {statusLabel && (
        <span className={`shrink-0 text-micro font-semibold tabular-nums ${statusColor}`}>
          {statusLabel}
        </span>
      )}
      {file.isDirty && (
        <Circle size={8} className="shrink-0 fill-zinc-400 text-zinc-400" />
      )}
      <button
        className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-700"
        title="Close file"
        onClick={onClose}
      >
        <X size={12} />
      </button>
    </div>
  )
}

const EMPTY_FILES: OpenFile[] = []

export function CodeEditor({ projectId }: { projectId: string }): React.ReactElement {
  const getFullThemeId = useThemeStore((s) => s.getFullThemeId)
  const minimapEnabled = useEditorPrefsStore((s) => s.minimapEnabled)
  const autosaveEnabled = useEditorPrefsStore((s) => s.autosaveEnabled)
  const autosaveDelayMs = useEditorPrefsStore((s) => s.autosaveDelayMs)
  const fontSize = useEditorPrefsStore((s) => s.fontSize)
  const tabSize = useEditorPrefsStore((s) => s.tabSize)
  const bracketPairColorization = useEditorPrefsStore((s) => s.bracketPairColorization)
  const formatOnSave = useEditorPrefsStore((s) => s.formatOnSave)
  const openFiles = useEditorStore((s) => s.statePerProject[projectId]?.openFiles ?? EMPTY_FILES)
  const activeFilePath = useEditorStore((s) => s.statePerProject[projectId]?.activeFilePath ?? null)
  const gitStatusMap = useGitStore((s) => s.statusPerProject[projectId])
  const { setActiveFile, closeFile, editFileContent, reorderFiles } = useEditorStore()
  const [showSaved, setShowSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const themeId = getFullThemeId()
  const monacoTheme = MONACO_THEME_NAME[themeId] ?? 'github-dark'

  const flashSaved = useCallback(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setShowSaved(true)
    savedTimer.current = setTimeout(() => setShowSaved(false), 1500)
  }, [])

  useEffect(() => {
    return window.api.fs.onFileChanged((path, content) => {
      useEditorStore.getState().updateFileContent(path, content)
    })
  }, [])

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const formatOnSaveRef = useRef(formatOnSave)
  useEffect(() => { formatOnSaveRef.current = formatOnSave }, [formatOnSave])

  const saveActiveFile = useCallback(async (filePath: string): Promise<boolean> => {
    const ed = editorRef.current
    if (formatOnSaveRef.current && ed) {
      try {
        await ed.getAction('editor.action.formatDocument')?.run()
      } catch {
        // Formatter may not exist for this language — fall through to save
      }
    }
    return useEditorStore.getState().saveFile(projectId, filePath)
  }, [projectId])

  const applyPendingReveal = useCallback((filePath: string | null): void => {
    if (!filePath) return
    const ed = editorRef.current
    if (!ed) return
    const line = useEditorStore.getState().consumePendingRevealLine(filePath)
    if (line === null || line < 1) return
    ed.revealLineInCenter(line)
    ed.setPosition({ lineNumber: line, column: 1 })
    ed.focus()
  }, [])

  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance
    editorInstance.getModel()?.updateOptions({ tabSize })
    editorInstance.addAction({
      id: 'file-save',
      label: 'Save',
      keybindings: [2048 | 49],
      run: async () => {
        const state = useEditorStore.getState()
        const filePath = state.statePerProject[projectId]?.activeFilePath
        if (filePath) {
          const saved = await saveActiveFile(filePath)
          if (saved) flashSaved()
        }
      }
    })
    const activePath = useEditorStore.getState().statePerProject[projectId]?.activeFilePath
    requestAnimationFrame(() => applyPendingReveal(activePath))
  }, [projectId, flashSaved, tabSize, saveActiveFile, applyPendingReveal])

  useEffect(() => {
    editorRef.current?.getModel()?.updateOptions({ tabSize })
  }, [tabSize, activeFilePath])

  useEffect(() => {
    if (!activeFilePath) return
    const id = requestAnimationFrame(() => applyPendingReveal(activeFilePath))
    return () => cancelAnimationFrame(id)
  }, [activeFilePath, applyPendingReveal])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleTabDragEnd = useCallback((event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = openFiles.findIndex((f) => f.path === active.id)
    const toIndex = openFiles.findIndex((f) => f.path === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderFiles(projectId, fromIndex, toIndex)
    }
  }, [projectId, openFiles, reorderFiles])

  const handleChange = useCallback((value: string | undefined) => {
    if (value === undefined || !activeFilePath) return
    editFileContent(projectId, activeFilePath, value)
    if (!autosaveEnabled) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    const filePath = activeFilePath
    autosaveTimer.current = setTimeout(async () => {
      const saved = await saveActiveFile(filePath)
      if (saved) flashSaved()
    }, autosaveDelayMs)
  }, [projectId, activeFilePath, editFileContent, autosaveEnabled, autosaveDelayMs, saveActiveFile, flashSaved])

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b border-zinc-800 bg-zinc-900/50">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
          <SortableContext items={openFiles.map((f) => f.path)} strategy={horizontalListSortingStrategy}>
            {openFiles.map((file) => (
              <SortableTab
                key={file.path}
                file={file}
                isActive={file.path === activeFilePath}
                gitStatus={gitStatusMap?.[file.path]}
                onSelect={() => setActiveFile(projectId, file.path)}
                onClose={(e) => {
                  e.stopPropagation()
                  closeFile(projectId, file.path)
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <span
          className={`ml-2 text-micro text-emerald-400 transition-opacity duration-300 ${showSaved ? 'opacity-100' : 'opacity-0'}`}
        >
          Saved
        </span>
      </div>

      <div className="relative flex-1">
        {activeFile ? (
          activeFile.isBinary ? (
            <BinaryPreview file={activeFile} />
          ) : typeof activeFile.originalContent === 'string' ? (
            <MonacoErrorBoundary onRecover={() => { editorRef.current = null }}>
              <DiffEditor
                key={`diff-${activeFile.path}`}
                original={activeFile.originalContent}
                modified={activeFile.content}
                language={detectLanguage(activeFile.name)}
                theme={monacoTheme}
                beforeMount={handleBeforeMount}
                onMount={(diffEditor) => {
                  const modified = diffEditor.getModifiedEditor()
                  handleEditorMount(modified)
                  modified.onDidChangeModelContent(() => {
                    handleChange(modified.getValue())
                  })
                }}
                options={{
                  readOnly: false,
                  originalEditable: false,
                  renderSideBySide: false,
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
          ) : (
            <MonacoErrorBoundary onRecover={() => { editorRef.current = null }}>
              <Editor
                key={activeFile.path}
                value={activeFile.content}
                language={detectLanguage(activeFile.name)}
                theme={monacoTheme}
                beforeMount={handleBeforeMount}
                onMount={handleEditorMount}
                onChange={handleChange}
                options={{
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
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            No file open
          </div>
        )}
      </div>
    </div>
  )
}
