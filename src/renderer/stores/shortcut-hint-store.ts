import { create } from 'zustand'

interface ShortcutHintState {
  terminalNumbersVisible: boolean
  projectNumbersVisible: boolean
  setTerminalNumbersVisible: (visible: boolean) => void
  setProjectNumbersVisible: (visible: boolean) => void
  clear: () => void
}

export const useShortcutHintStore = create<ShortcutHintState>((set) => ({
  terminalNumbersVisible: false,
  projectNumbersVisible: false,
  setTerminalNumbersVisible: (visible) => set({ terminalNumbersVisible: visible }),
  setProjectNumbersVisible: (visible) => set({ projectNumbersVisible: visible }),
  clear: () => set({ terminalNumbersVisible: false, projectNumbersVisible: false })
}))
