import { useState, useRef, useCallback } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { useClaudeStore } from '@/stores/claude-store'
import { useThemeStore } from '@/stores/theme-store'
import { registerMonacoThemes, MONACO_THEME_NAME } from '@/config/monaco-theme-registry'
import type { editor } from 'monaco-editor'

const EXT_LANG: Record<string, string> = {
  md: 'markdown',
  json: 'json',
  ts: 'typescript',
  js: 'javascript',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini'
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

function handleBeforeMount(monaco: Monaco): void {
  registerMonacoThemes(monaco)
}

export function ClaudeEditor({ projectId }: { projectId: string }): React.ReactElement {
  const activeFilePath = useClaudeStore((s) => s.activeFilePerProject[projectId] ?? null)
  const content = useClaudeStore((s) => (activeFilePath ? s.contentCache[activeFilePath] : undefined))
  const { saveFile } = useClaudeStore()
  const getFullThemeId = useThemeStore((s) => s.getFullThemeId)
  const [showSaved, setShowSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const themeId = getFullThemeId()
  const monacoTheme = MONACO_THEME_NAME[themeId] ?? 'github-dark'

  const filename = activeFilePath?.split('/').pop() ?? ''

  const flashSaved = useCallback(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setShowSaved(true)
    savedTimer.current = setTimeout(() => setShowSaved(false), 1500)
  }, [])

  const handleMount = (editorInstance: editor.IStandaloneCodeEditor): void => {
    editorInstance.addAction({
      id: 'claude-save',
      label: 'Save',
      keybindings: [2048 | 49],
      run: async () => {
        if (activeFilePath) {
          await saveFile(activeFilePath, editorInstance.getValue())
          flashSaved()
        }
      }
    })
  }

  if (!activeFilePath || content === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-600">
        Select a file
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
        <span className="text-xs text-zinc-400 truncate">{filename}</span>
        {showSaved && (
          <span className="ml-2 text-[10px] text-emerald-400 animate-fade-in">Saved</span>
        )}
      </div>
      <div className="flex-1">
        <Editor
          key={activeFilePath}
          value={content}
          language={detectLanguage(filename)}
          theme={monacoTheme}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 8 }
          }}
        />
      </div>
    </div>
  )
}
