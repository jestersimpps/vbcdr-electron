import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/config/theme-registry', () => ({
  getThemeById: vi.fn((id: string) => {
    if (id === 'mono') return { id, name: 'Mono', supportsLightMode: false }
    if (id === 'github') return { id, name: 'GitHub', supportsLightMode: true }
    if (id === 'unknown') return undefined
    return { id, name: id, supportsLightMode: true }
  })
}))

vi.mock('@/config/terminal-theme-registry', () => ({
  setCustomTerminalTheme: vi.fn()
}))

vi.mock('@/models/custom-theme', () => ({
  DEFAULT_CUSTOM_DARK: { ui: { bg: '#000' }, terminal: { background: '#000' } },
  DEFAULT_CUSTOM_LIGHT: { ui: { bg: '#fff' }, terminal: { background: '#fff' } }
}))

async function importFresh(): Promise<typeof import('./theme-store')> {
  vi.resetModules()
  return import('./theme-store')
}

describe('theme-store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state from localStorage', () => {
    it('defaults to github-dark when nothing is stored', async () => {
      const { useThemeStore } = await importFresh()
      const s = useThemeStore.getState()
      expect(s.themeName).toBe('github')
      expect(s.variant).toBe('dark')
      expect(s.terminalThemeId).toBe('')
    })

    it('migrates legacy "dark" / "light" / "psychedelic" values', async () => {
      localStorage.setItem('theme', 'light')
      let mod = await importFresh()
      expect(mod.useThemeStore.getState().themeName).toBe('github')
      expect(mod.useThemeStore.getState().variant).toBe('light')

      localStorage.setItem('theme', 'psychedelic')
      mod = await importFresh()
      expect(mod.useThemeStore.getState().themeName).toBe('psychedelic')
      expect(mod.useThemeStore.getState().variant).toBe('dark')
    })

    it('parses a full themeName-variant id', async () => {
      localStorage.setItem('theme', 'dracula-dark')
      const { useThemeStore } = await importFresh()
      expect(useThemeStore.getState().themeName).toBe('dracula')
      expect(useThemeStore.getState().variant).toBe('dark')
    })

    it('falls back to github-dark on unrecognised stored values', async () => {
      localStorage.setItem('theme', 'garbage-value-no-variant')
      const { useThemeStore } = await importFresh()
      expect(useThemeStore.getState().themeName).toBe('github')
      expect(useThemeStore.getState().variant).toBe('dark')
    })

    it('reads custom colors from localStorage', async () => {
      localStorage.setItem('customDark', JSON.stringify({ ui: { bg: '#111' }, terminal: { background: '#111' } }))
      const { useThemeStore } = await importFresh()
      expect(useThemeStore.getState().customDark).toEqual({ ui: { bg: '#111' }, terminal: { background: '#111' } })
    })
  })

  describe('setTheme', () => {
    it('updates themeName and persists the full id', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.getState().setTheme('dracula')
      expect(useThemeStore.getState().themeName).toBe('dracula')
      expect(localStorage.getItem('theme')).toBe('dracula-dark')
    })

    it('forces variant back to dark when the new theme does not support light mode', async () => {
      localStorage.setItem('theme', 'github-light')
      const { useThemeStore } = await importFresh()
      expect(useThemeStore.getState().variant).toBe('light')

      useThemeStore.getState().setTheme('mono')
      expect(useThemeStore.getState().themeName).toBe('mono')
      expect(useThemeStore.getState().variant).toBe('dark')
      expect(localStorage.getItem('theme')).toBe('mono-dark')
    })

    it('is a no-op when the theme id is unknown', async () => {
      const { useThemeStore } = await importFresh()
      const before = { ...useThemeStore.getState() }
      useThemeStore.getState().setTheme('unknown')
      const after = useThemeStore.getState()
      expect(after.themeName).toBe(before.themeName)
      expect(after.variant).toBe(before.variant)
    })
  })

  describe('setVariant / toggleVariant', () => {
    it('setVariant("light") is rejected when theme does not support light mode', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.setState({ themeName: 'mono', variant: 'dark' })
      useThemeStore.getState().setVariant('light')
      expect(useThemeStore.getState().variant).toBe('dark')
    })

    it('setVariant updates and persists', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.getState().setVariant('light')
      expect(useThemeStore.getState().variant).toBe('light')
      expect(localStorage.getItem('theme')).toBe('github-light')
    })

    it('toggleVariant flips dark<->light when supported', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.getState().toggleVariant()
      expect(useThemeStore.getState().variant).toBe('light')
      useThemeStore.getState().toggleVariant()
      expect(useThemeStore.getState().variant).toBe('dark')
    })

    it('toggleVariant is a no-op for themes without light mode', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.setState({ themeName: 'mono', variant: 'dark' })
      useThemeStore.getState().toggleVariant()
      expect(useThemeStore.getState().variant).toBe('dark')
    })
  })

  describe('getFullThemeId / getTerminalThemeId', () => {
    it('joins themeName and variant', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.setState({ themeName: 'nord', variant: 'light' })
      expect(useThemeStore.getState().getFullThemeId()).toBe('nord-light')
    })

    it('uses explicit terminalThemeId when set, else falls back to the UI theme', async () => {
      const { useThemeStore } = await importFresh()
      useThemeStore.setState({ themeName: 'nord', variant: 'dark' })
      expect(useThemeStore.getState().getTerminalThemeId()).toBe('nord-dark')

      useThemeStore.getState().setTerminalTheme('dracula-dark')
      expect(useThemeStore.getState().getTerminalThemeId()).toBe('dracula-dark')
      expect(localStorage.getItem('terminalTheme')).toBe('dracula-dark')
    })

    it('setTerminalTheme("") clears localStorage', async () => {
      localStorage.setItem('terminalTheme', 'dracula-dark')
      const { useThemeStore } = await importFresh()
      useThemeStore.getState().setTerminalTheme('')
      expect(useThemeStore.getState().terminalThemeId).toBe('')
      expect(localStorage.getItem('terminalTheme')).toBeNull()
    })
  })

  describe('setCustomTheme', () => {
    it('persists colors and notifies the terminal-theme registry', async () => {
      const { useThemeStore } = await importFresh()
      const { setCustomTerminalTheme } = await import('@/config/terminal-theme-registry')
      const colors = { ui: { bg: '#222' }, terminal: { background: '#222' } } as never

      useThemeStore.getState().setCustomTheme('dark', colors)
      expect(useThemeStore.getState().customDark).toBe(colors)
      expect(localStorage.getItem('customDark')).toBe(JSON.stringify(colors))
      expect(setCustomTerminalTheme).toHaveBeenCalledWith('dark', colors.terminal)

      useThemeStore.getState().setCustomTheme('light', colors)
      expect(useThemeStore.getState().customLight).toBe(colors)
      expect(localStorage.getItem('customLight')).toBe(JSON.stringify(colors))
    })
  })
})
