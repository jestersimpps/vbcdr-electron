export interface ThemeDefinition {
  id: string
  name: string
  category: 'popular' | 'classic' | 'experimental' | 'custom'
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
  { id: 'psychedelic', name: 'Psychedelic', category: 'experimental', supportsLightMode: true },
  { id: 'synthwave', name: 'Synthwave', category: 'experimental', supportsLightMode: true },
  { id: 'cyberpunk', name: 'Cyberpunk', category: 'experimental', supportsLightMode: true },
  { id: 'rainbow', name: 'Rainbow', category: 'experimental', supportsLightMode: true },
  { id: 'tropical', name: 'Tropical', category: 'experimental', supportsLightMode: true },
  { id: 'afternoon', name: 'Afternoon', category: 'experimental', supportsLightMode: true },
  { id: 'custom', name: 'Custom', category: 'custom', supportsLightMode: true },
]

export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEME_REGISTRY.find((theme) => theme.id === id)
}

export function getThemesByCategory(category: ThemeDefinition['category']): ThemeDefinition[] {
  return THEME_REGISTRY.filter((theme) => theme.category === category)
}

export function isCustomTheme(id: string): boolean {
  return id === 'custom'
}
