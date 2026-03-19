import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Palette, ChevronDown, Pencil } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import { getThemesByCategory, type ThemeDefinition } from '@/config/theme-registry'
import { CustomThemeEditor } from './CustomThemeEditor'

export function ThemePicker(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ bottom: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const themeName = useThemeStore((s) => s.themeName)
  const setTheme = useThemeStore((s) => s.setTheme)

  const currentName = themeName === 'custom' ? 'Custom' : (
    [...getThemesByCategory('popular'), ...getThemesByCategory('classic'), ...getThemesByCategory('experimental')]
      .find((t) => t.id === themeName)?.name ?? 'Theme'
  )

  const openMenu = (): void => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({
        bottom: window.innerHeight - rect.top,
        right: window.innerWidth - rect.right,
      })
    }
    setIsOpen(true)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => isOpen ? setIsOpen(false) : openMenu()}
        className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Palette size={13} />
        <span>{currentName}</span>
        <ChevronDown size={10} />
      </button>

      {isOpen && createPortal(
        <ThemePickerMenu
          currentTheme={themeName}
          menuPos={menuPos}
          onSelectTheme={(themeId) => {
            setTheme(themeId)
            setIsOpen(false)
          }}
          onOpenEditor={() => {
            setTheme('custom')
            setIsOpen(false)
            setIsEditorOpen(true)
          }}
          onClose={() => setIsOpen(false)}
        />,
        document.body
      )}

      {isEditorOpen && <CustomThemeEditor onClose={() => setIsEditorOpen(false)} />}
    </div>
  )
}

interface ThemePickerMenuProps {
  currentTheme: string
  menuPos: { bottom: number; right: number }
  onSelectTheme: (themeId: string) => void
  onOpenEditor: () => void
  onClose: () => void
}

function ThemePickerMenu({ currentTheme, menuPos, onSelectTheme, onOpenEditor, onClose }: ThemePickerMenuProps): React.ReactElement {
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
      style={{ bottom: menuPos.bottom, right: menuPos.right }}
      className="fixed mb-2 w-48 bg-zinc-900 border border-zinc-700 rounded shadow-lg max-h-96 overflow-y-auto z-[9999]"
    >
      <ThemeSection title="Popular" themes={popularThemes} currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
      <ThemeSection title="Classic" themes={classicThemes} currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
      <ThemeSection
        title="Experimental"
        themes={experimentalThemes}
        currentTheme={currentTheme}
        onSelectTheme={onSelectTheme}
      />
      <div className="p-2">
        <div className="text-xs text-zinc-500 mb-1 font-medium">Custom</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectTheme('custom')}
            className="flex items-center gap-2 flex-1 px-2 py-1 hover:bg-zinc-800 rounded text-xs"
          >
            <div className={`w-2 h-2 rounded-full ${currentTheme === 'custom' ? 'bg-blue-500' : 'bg-zinc-700'}`} />
            <span>Custom</span>
          </button>
          <button
            onClick={onOpenEditor}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Edit custom theme"
          >
            <Pencil size={11} />
          </button>
        </div>
      </div>
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
