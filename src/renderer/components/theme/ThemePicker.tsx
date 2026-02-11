import { useState, useRef, useEffect } from 'react'
import { Palette, ChevronDown } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import { getThemeById, getThemesByCategory, type ThemeDefinition } from '@/config/theme-registry'

export function ThemePicker(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const themeName = useThemeStore((s) => s.themeName)
  const setTheme = useThemeStore((s) => s.setTheme)

  const currentThemeDef = getThemeById(themeName)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Palette size={13} />
        <span>{currentThemeDef?.name ?? 'Theme'}</span>
        <ChevronDown size={10} />
      </button>

      {isOpen && (
        <ThemePickerMenu
          currentTheme={themeName}
          onSelectTheme={(themeId) => {
            setTheme(themeId)
            setIsOpen(false)
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

interface ThemePickerMenuProps {
  currentTheme: string
  onSelectTheme: (themeId: string) => void
  onClose: () => void
}

function ThemePickerMenu({ currentTheme, onSelectTheme, onClose }: ThemePickerMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)
  const popularThemes = getThemesByCategory('popular')
  const classicThemes = getThemesByCategory('classic')
  const experimentalThemes = getThemesByCategory('experimental')

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full right-0 mb-2 w-48 bg-zinc-900 border border-zinc-700 rounded shadow-lg max-h-96 overflow-y-auto"
    >
      <ThemeSection title="Popular" themes={popularThemes} currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
      <ThemeSection title="Classic" themes={classicThemes} currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
      <ThemeSection
        title="Experimental"
        themes={experimentalThemes}
        currentTheme={currentTheme}
        onSelectTheme={onSelectTheme}
      />
    </div>
  )
}

interface ThemeSectionProps {
  title: string
  themes: ThemeDefinition[]
  currentTheme: string
  onSelectTheme: (themeId: string) => void
}

function ThemeSection({ title, themes, currentTheme, onSelectTheme }: ThemeSectionProps): React.ReactElement {
  return (
    <div className="p-2 border-b border-zinc-800 last:border-0">
      <div className="text-xs text-zinc-500 mb-1 font-medium">{title}</div>
      {themes.map((theme) => (
        <ThemeOption
          key={theme.id}
          theme={theme}
          isSelected={currentTheme === theme.id}
          onSelect={() => onSelectTheme(theme.id)}
        />
      ))}
    </div>
  )
}

interface ThemeOptionProps {
  theme: ThemeDefinition
  isSelected: boolean
  onSelect: () => void
}

function ThemeOption({ theme, isSelected, onSelect }: ThemeOptionProps): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2 w-full px-2 py-1 hover:bg-zinc-800 rounded text-xs"
    >
      <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-zinc-700'}`} />
      <span>{theme.name}</span>
    </button>
  )
}
