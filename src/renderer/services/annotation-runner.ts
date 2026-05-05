import { useAnnotationStore, type ExplainLevel } from '@/stores/annotation-store'
import type { DiffView } from '@/stores/diff-view-store'

const inflight = new Map<string, Promise<void>>()

function key(projectId: string, view: DiffView): string {
  if (view.kind === 'working') return `${projectId}|working`
  if (view.kind === 'commit') return `${projectId}|commit|${view.hash}`
  return `${projectId}|${view.kind}|${view.from}..${view.to}`
}

function sourceFromView(view: DiffView):
  | { kind: 'working' }
  | { kind: 'commit'; hash: string }
  | { kind: 'range'; from: string; to: string } {
  if (view.kind === 'commit') return { kind: 'commit', hash: view.hash }
  if (view.kind === 'incoming' || view.kind === 'outgoing') return { kind: 'range', from: view.from, to: view.to }
  return { kind: 'working' }
}

export const annotationRunner = {
  isRunning(projectId: string, view: DiffView): boolean {
    return inflight.has(key(projectId, view))
  },
  async start(projectId: string, view: DiffView, cwd: string, level: ExplainLevel): Promise<void> {
    const k = key(projectId, view)
    if (inflight.has(k)) return inflight.get(k)
    const store = useAnnotationStore.getState()
    store.setGeneration(projectId, view, { status: 'running', level })
    const job = (async () => {
      try {
        const result = await window.api.claude.explainDiff(cwd, sourceFromView(view), level)
        useAnnotationStore.getState().setResult(projectId, view, {
          diffSha: result.diffSha,
          level: result.level ?? level,
          files: result.files
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to explain changes'
        useAnnotationStore.getState().setGeneration(projectId, view, { status: 'error', level, error: msg })
      } finally {
        inflight.delete(k)
      }
    })()
    inflight.set(k, job)
    return job
  }
}
