import { useAnnotationStore } from '@/stores/annotation-store'
import type { DiffView } from '@/stores/diff-view-store'

export interface TourStep {
  text: string
}

interface Run {
  projectId: string
  view: DiffView
  steps: TourStep[]
  cancelled: boolean
}

let current: Run | null = null

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    u.pitch = 1
    const done = (): void => resolve()
    u.onend = done
    u.onerror = done
    window.speechSynthesis.speak(u)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function runLoop(run: Run, startAt: number): Promise<void> {
  const store = useAnnotationStore.getState()
  store.setTour(run.projectId, run.view, { status: 'playing', index: Math.max(0, startAt) })
  for (let i = Math.max(0, startAt); i < run.steps.length; i++) {
    if (run.cancelled) break
    useAnnotationStore.getState().setTour(run.projectId, run.view, { status: 'playing', index: i })
    await delay(350)
    if (run.cancelled) break
    await speak(run.steps[i].text)
    if (run.cancelled) break
    await delay(200)
  }
  if (current === run) {
    useAnnotationStore.getState().setTour(run.projectId, run.view, { status: 'idle', index: 0 })
    current = null
  }
}

export const tourRunner = {
  start(projectId: string, view: DiffView, steps: TourStep[], startAt: number = 0): void {
    if (steps.length === 0) return
    if (current) {
      current.cancelled = true
      const stale = current
      useAnnotationStore.getState().setTour(stale.projectId, stale.view, { status: 'idle', index: 0 })
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    const run: Run = { projectId, view, steps, cancelled: false }
    current = run
    void runLoop(run, startAt)
  },
  stop(): void {
    if (!current) return
    const stale = current
    stale.cancelled = true
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    useAnnotationStore.getState().setTour(stale.projectId, stale.view, { status: 'idle', index: 0 })
    current = null
  },
  isRunningFor(projectId: string, view: DiffView): boolean {
    if (!current) return false
    return current.projectId === projectId && sameView(current.view, view)
  }
}

function sameView(a: DiffView, b: DiffView): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'working') return true
  if (a.kind === 'commit' && b.kind === 'commit') return a.hash === b.hash
  if ((a.kind === 'incoming' || a.kind === 'outgoing') && a.kind === b.kind) {
    return a.from === (b as typeof a).from && a.to === (b as typeof a).to
  }
  return false
}
