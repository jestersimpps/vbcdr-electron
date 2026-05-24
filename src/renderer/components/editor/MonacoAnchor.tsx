import { useEffect, useRef } from 'react'
import { loader } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { registerMonacoThemes } from '@/config/monaco-theme-registry'

export function MonacoAnchor(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    let cancelled = false
    const init = loader.init()
    init
      .then((monaco) => {
        if (cancelled || !hostRef.current || editorRef.current) return
        registerMonacoThemes(monaco)

        const diagnosticsOptions = {
          noSemanticValidation: false,
          noSyntaxValidation: false,
          noSuggestionDiagnostics: true,
          diagnosticCodesToIgnore: [
            2306, 2503, 2580, 2611, 2683, 2686, 2792,
            6133, 6196, 7016, 7026, 7031, 8006
          ]
        }
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)

        editorRef.current = monaco.editor.create(hostRef.current, {
          value: '',
          language: 'plaintext',
          automaticLayout: false,
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          renderLineHighlight: 'none'
        })
      })
      .catch((err) => {
        if (err?.type !== 'cancelation') console.error('MonacoAnchor init error:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        width: 1,
        height: 1,
        left: -9999,
        top: -9999,
        pointerEvents: 'none',
        opacity: 0,
        overflow: 'hidden'
      }}
    />
  )
}
