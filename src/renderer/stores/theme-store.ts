import { create } from 'zustand'

type Theme = 'dark' | 'light' | 'psychedelic'

interface ThemeStore {
  theme: Theme
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: (localStorage.getItem('theme') as Theme) ?? 'dark',

  toggleTheme: () => {
    const current = get().theme
    const next = current === 'dark' ? 'light' : current === 'light' ? 'psychedelic' : 'dark'
    localStorage.setItem('theme', next)
    set({ theme: next })
  }
}))
