import Editor from '@monaco-editor/react'
import { useEditorStore } from '@/stores/editor-store'
import { X } from 'lucide-react'

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

export function CodeEditor(): React.ReactElement {
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const { setActiveFile, closeFile } = useEditorStore()

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex min-h-[36px] items-center gap-0 overflow-x-auto border-b border-zinc-800 bg-zinc-900/50">
        {openFiles.map((file) => (
          <div
            key={file.path}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-zinc-800 px-3 py-2 text-xs ${
              file.path === activeFilePath
                ? 'bg-zinc-950 text-zinc-200'
                : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
            }`}
            onClick={() => setActiveFile(file.path)}
          >
            <span className="truncate max-w-[120px]">{file.name}</span>
            <button
              className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-700"
              onClick={(e) => {
                e.stopPropagation()
                closeFile(file.path)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1">
        {activeFile ? (
          <Editor
            key={activeFile.path}
            defaultValue={activeFile.content}
            language={detectLanguage(activeFile.name)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8 }
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            No file open
          </div>
        )}
      </div>
    </div>
  )
}
