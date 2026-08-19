import { create } from 'zustand'

const SEEN_KEY = 'tutorialSeen'

interface TutorialStore {
  open: boolean
  stepIndex: number
  startTutorial: () => void
  closeTutorial: () => void
  goToStep: (index: number) => void
  nextStep: (total: number) => void
  prevStep: () => void
}

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  open: false,
  stepIndex: 0,

  startTutorial: () => {
    set({ open: true, stepIndex: 0 })
  },

  closeTutorial: () => {
    markSeen()
    set({ open: false })
  },

  goToStep: (index) => {
    set({ stepIndex: Math.max(0, index) })
  },

  nextStep: (total) => {
    const next = get().stepIndex + 1
    if (next >= total) {
      get().closeTutorial()
      return
    }
    set({ stepIndex: next })
  },

  prevStep: () => {
    set({ stepIndex: Math.max(0, get().stepIndex - 1) })
  }
}))
