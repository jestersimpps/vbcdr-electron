import { create } from 'zustand'

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  error?: string
}

interface UpdaterStore {
  state: UpdateState
  version: string | undefined
  percent: number | undefined
  dismissed: boolean
  init: () => () => void
  check: () => void
  install: () => void
  dismiss: () => void
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  state: 'idle',
  version: undefined,
  percent: undefined,
  dismissed: false,

  init: () => {
    window.api.updater.getStatus().then((status: UpdateStatus) => {
      set({ state: status.state, version: status.version, percent: status.percent })
    })
    const unsub = window.api.updater.onStatus((status) => {
      const s = status as UpdateStatus
      set({ state: s.state, version: s.version, percent: s.percent, dismissed: false })
    })
    return unsub
  },

  check: () => {
    window.api.updater.check()
  },

  install: () => {
    window.api.updater.install()
  },

  dismiss: () => {
    set({ dismissed: true })
  }
}))
