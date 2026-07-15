import { create } from 'zustand'

interface ClipboardStore {
  pendingImage: string | null
  init: () => () => void
  clearPending: () => void
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  pendingImage: null,

  init: () => {
    window.api.clipboard.currentImage().then((dataUrl) => {
      if (dataUrl) set({ pendingImage: dataUrl })
    })
    return window.api.clipboard.onImage((dataUrl) => {
      set({ pendingImage: dataUrl })
    })
  },

  clearPending: () => set({ pendingImage: null })
}))
