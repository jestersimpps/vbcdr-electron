import { create } from 'zustand'
import type { DiffView } from './diff-view-store'

export interface DiffComment {
  line: number
  side: 'old' | 'new'
  text: string
}

export interface FileAnnotation {
  path: string
  summary?: string
  comments: DiffComment[]
}

export type ExplainLevel = 'functional' | 'technical' | 'deep'

export type GenerationStatus =
  | { status: 'idle' }
  | { status: 'running'; level: ExplainLevel }
  | { status: 'error'; level: ExplainLevel; error: string }

export type TourStatus = 'idle' | 'playing'

export interface AnnotationEntry {
  diffSha?: string
  level: ExplainLevel | null
  annotations: Record<string, FileAnnotation>
  generation: GenerationStatus
  tour: { status: TourStatus; index: number }
}

function viewKey(projectId: string, view: DiffView): string {
  if (view.kind === 'working') return `${projectId}|working`
  if (view.kind === 'commit') return `${projectId}|commit|${view.hash}`
  return `${projectId}|${view.kind}|${view.from}..${view.to}`
}

const EMPTY_ENTRY: AnnotationEntry = {
  diffSha: undefined,
  level: null,
  annotations: {},
  generation: { status: 'idle' },
  tour: { status: 'idle', index: 0 }
}

interface AnnotationStore {
  entries: Record<string, AnnotationEntry>
  get: (projectId: string, view: DiffView) => AnnotationEntry
  setGeneration: (projectId: string, view: DiffView, generation: GenerationStatus) => void
  setResult: (
    projectId: string,
    view: DiffView,
    payload: { diffSha: string; level: ExplainLevel; files: FileAnnotation[] }
  ) => void
  clearResult: (projectId: string, view: DiffView) => void
  setTour: (projectId: string, view: DiffView, tour: { status: TourStatus; index: number }) => void
}

export const useAnnotationStore = create<AnnotationStore>((set, getStore) => ({
  entries: {},
  get: (projectId, view) => getStore().entries[viewKey(projectId, view)] ?? EMPTY_ENTRY,
  setGeneration: (projectId, view, generation) => {
    const key = viewKey(projectId, view)
    set((s) => ({
      entries: {
        ...s.entries,
        [key]: { ...(s.entries[key] ?? EMPTY_ENTRY), generation }
      }
    }))
  },
  setResult: (projectId, view, payload) => {
    const key = viewKey(projectId, view)
    const annotations: Record<string, FileAnnotation> = {}
    for (const f of payload.files) annotations[f.path] = f
    set((s) => ({
      entries: {
        ...s.entries,
        [key]: {
          ...(s.entries[key] ?? EMPTY_ENTRY),
          diffSha: payload.diffSha,
          level: payload.level,
          annotations,
          generation: { status: 'idle' },
          tour: { status: 'idle', index: 0 }
        }
      }
    }))
  },
  clearResult: (projectId, view) => {
    const key = viewKey(projectId, view)
    set((s) => ({
      entries: { ...s.entries, [key]: { ...EMPTY_ENTRY } }
    }))
  },
  setTour: (projectId, view, tour) => {
    const key = viewKey(projectId, view)
    set((s) => ({
      entries: {
        ...s.entries,
        [key]: { ...(s.entries[key] ?? EMPTY_ENTRY), tour }
      }
    }))
  }
}))

export const annotationViewKey = viewKey
