import { useCallback, useEffect, useRef } from 'react'
import type { editor as MonacoEditorNS } from 'monaco-editor'

// @monaco-editor/react disposes the diff models BEFORE the widget on unmount,
// which trips Monaco's "TextModel got disposed before DiffEditorWidget model
// got reset" assertion. The DiffEditor must be rendered with
// keepCurrentOriginalModel/keepCurrentModifiedModel so the wrapper leaves the
// models alone; this hook disposes them once the widget has let go of them.
export function useDiffEditorModels(): (editor: MonacoEditorNS.IStandaloneDiffEditor) => void {
  const modelsRef = useRef<MonacoEditorNS.IDiffEditorModel | null>(null)

  useEffect(() => {
    return () => {
      disposeWhenDetached(modelsRef.current)
      modelsRef.current = null
    }
  }, [])

  return useCallback((editor: MonacoEditorNS.IStandaloneDiffEditor): void => {
    const previous = modelsRef.current
    modelsRef.current = editor.getModel()
    if (previous && previous !== modelsRef.current) disposeWhenDetached(previous)
  }, [])
}

function disposeWhenDetached(models: MonacoEditorNS.IDiffEditorModel | null): void {
  if (!models) return
  // Deferred: React tears down this hook's owner before the DiffEditor child
  // disposes the widget, so the models are still attached at cleanup time.
  queueMicrotask(() => {
    for (const model of [models.original, models.modified]) {
      if (!model.isDisposed() && !model.isAttachedToEditor()) model.dispose()
    }
  })
}
