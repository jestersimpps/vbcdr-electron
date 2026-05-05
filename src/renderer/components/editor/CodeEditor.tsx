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
import { BinaryPreview } from '@/components/editor/BinaryPreview'
import { GIT_STATUS_COLORS, GIT_STATUS_LABELS } from '@/config/git-status-style'
import { useGitStore } from '@/stores/git-store'
import { X, Circle } from 'lucide-react'
import type { OpenFile, GitFileStatus } from '@/models/types'
import type { editor } from 'monaco-editor'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
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
