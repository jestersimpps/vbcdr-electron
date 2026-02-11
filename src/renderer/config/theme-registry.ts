export interface ThemeDefinition {
  id: string
  name: string
  category: 'popular' | 'classic' | 'experimental'
  supportsLightMode: boolean
}

export const THEME_REGISTRY: ThemeDefinition[] = [
  { id: 'github', name: 'GitHub', category: 'popular', supportsLightMode: true },
  { id: 'onedark-pro', name: 'One Dark Pro', category: 'popular', supportsLightMode: true },
  { id: 'dracula', name: 'Dracula', category: 'popular', supportsLightMode: true },
  { id: 'material', name: 'Material', category: 'popular', supportsLightMode: true },
  { id: 'nord', name: 'Nord', category: 'popular', supportsLightMode: true },
  { id: 'tokyo-night', name: 'Tokyo Night', category: 'popular', supportsLightMode: true },
  { id: 'catppuccin', name: 'Catppuccin', category: 'popular', supportsLightMode: true },
  { id: 'pastel', name: 'Pastel', category: 'popular', supportsLightMode: true },
  { id: 'gruvbox', name: 'Gruvbox', category: 'classic', supportsLightMode: true },
  { id: 'monokai', name: 'Monokai', category: 'classic', supportsLightMode: true },
  { id: 'psychedelic', name: 'Psychedelic', category: 'experimental', supportsLightMode: false },
]

export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEME_REGISTRY.find((theme) => theme.id === id)
}

export function getThemesByCategory(category: ThemeDefinition['category']): ThemeDefinition[] {
  return THEME_REGISTRY.filter((theme) => theme.category === category)
}
