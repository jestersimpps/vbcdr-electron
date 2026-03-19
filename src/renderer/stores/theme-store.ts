import { create } from 'zustand'
import { getThemeById } from '@/config/theme-registry'
import { setCustomTerminalTheme } from '@/config/terminal-theme-registry'
import { type CustomThemeColors, DEFAULT_CUSTOM_DARK, DEFAULT_CUSTOM_LIGHT } from '@/models/custom-theme'

type Variant = 'dark' | 'light'

interface ThemeStore {
  themeName: string
  variant: Variant
  terminalThemeId: string
  customDark: CustomThemeColors
  customLight: CustomThemeColors
  setTheme: (themeName: string) => void
  setVariant: (variant: Variant) => void
  toggleVariant: () => void
  getFullThemeId: () => string
  setTerminalTheme: (id: string) => void
  getTerminalThemeId: () => string
  setCustomTheme: (variant: Variant, colors: CustomThemeColors) => void
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

function loadCustomColors(key: string, fallback: CustomThemeColors): CustomThemeColors {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return fallback
}

const initialTheme = migrateTheme(localStorage.getItem('theme'))
const initialCustomDark = loadCustomColors('customDark', DEFAULT_CUSTOM_DARK)
const initialCustomLight = loadCustomColors('customLight', DEFAULT_CUSTOM_LIGHT)

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themeName: initialTheme.themeName,
  variant: initialTheme.variant,
  terminalThemeId: localStorage.getItem('terminalTheme') ?? '',
  customDark: initialCustomDark,
  customLight: initialCustomLight,

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
  },

  setTerminalTheme: (id: string) => {
    if (id) {
      localStorage.setItem('terminalTheme', id)
    } else {
      localStorage.removeItem('terminalTheme')
    }
    set({ terminalThemeId: id })
  },

  getTerminalThemeId: () => {
    const { terminalThemeId, themeName, variant } = get()
    return terminalThemeId || `${themeName}-${variant}`
  },

  setCustomTheme: (variant: Variant, colors: CustomThemeColors) => {
    const key = variant === 'dark' ? 'customDark' : 'customLight'
    localStorage.setItem(key, JSON.stringify(colors))
    setCustomTerminalTheme(variant, colors.terminal)
    set(variant === 'dark' ? { customDark: colors } : { customLight: colors })
  },
}))
