import { create } from 'zustand'
import { getThemeById } from '@/config/theme-registry'

type Variant = 'dark' | 'light'

interface ThemeStore {
  themeName: string
  variant: Variant
  setTheme: (themeName: string) => void
  setVariant: (variant: Variant) => void
  toggleVariant: () => void
  getFullThemeId: () => string
}

const LEGACY_MAPPING: Record<string, { themeName: string; variant: Variant }> = {
  dark: { themeName: 'github', variant: 'dark' },
  light: { themeName: 'github', variant: 'light' },
  psychedelic: { themeName: 'psychedelic', variant: 'dark' }
}

function parseThemeId(fullId: string): { themeName: string; variant: Variant } | null {
  const match = fullId.match(/^(.+)-(dark|light)$/)
  if (match) {
    return { themeName: match[1], variant: match[2] as Variant }
  }
  return null
}

function migrateTheme(stored: string | null): { themeName: string; variant: Variant } {
  if (!stored) return { themeName: 'github', variant: 'dark' }

  const legacy = LEGACY_MAPPING[stored]
  if (legacy) return legacy

  const parsed = parseThemeId(stored)
  if (parsed) return parsed

  return { themeName: 'github', variant: 'dark' }
}

const initialTheme = migrateTheme(localStorage.getItem('theme'))

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themeName: initialTheme.themeName,
  variant: initialTheme.variant,

  setTheme: (themeName: string) => {
    const theme = getThemeById(themeName)
    if (!theme) return

    let variant = get().variant
    if (!theme.supportsLightMode && variant === 'light') {
      variant = 'dark'
    }

    const fullThemeId = `${themeName}-${variant}`
    localStorage.setItem('theme', fullThemeId)
    set({ themeName, variant })
  },

  setVariant: (variant: Variant) => {
    const themeName = get().themeName
    const theme = getThemeById(themeName)

    if (variant === 'light' && theme && !theme.supportsLightMode) {
      return
    }

    const fullThemeId = `${themeName}-${variant}`
    localStorage.setItem('theme', fullThemeId)
    set({ variant })
  },

  toggleVariant: () => {
    const current = get().variant
    const themeName = get().themeName
    const theme = getThemeById(themeName)

    if (!theme?.supportsLightMode) return

    const next = current === 'dark' ? 'light' : 'dark'
    const fullThemeId = `${themeName}-${next}`
    localStorage.setItem('theme', fullThemeId)
    set({ variant: next })
  },

  getFullThemeId: () => {
    const { themeName, variant } = get()
    return `${themeName}-${variant}`
  }
}))
