import { useState } from 'react'
import { Moon, Palette, Pencil, Sun, type LucideIcon } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import { getThemesByCategory, getThemeById, type ThemeDefinition } from '@/config/theme-registry'
import { CustomThemeEditor } from '@/components/theme/CustomThemeEditor'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

export function ThemeSection(): React.ReactElement {
  const themeName = useThemeStore((s) => s.themeName)
  const variant = useThemeStore((s) => s.variant)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setVariant = useThemeStore((s) => s.setVariant)
  const accent = useAccent()
  const [editorOpen, setEditorOpen] = useState(false)

  const current = getThemeById(themeName)
  const supportsLight = current?.supportsLightMode ?? false

  const popular = getThemesByCategory('popular')
  const classic = getThemesByCategory('classic')
  const experimental = getThemesByCategory('experimental')

  return (
    <SectionCard title="Theme" description="Pick a theme and color variant.">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Variant</span>
          {!supportsLight && (
            <span className="text-micro text-zinc-600">Current theme is dark only</span>
          )}
        </div>
        <div className="inline-flex rounded border border-zinc-800 bg-zinc-900/80 p-0.5">
          <VariantButton
            label="Dark"
            icon={Moon}
            active={variant === 'dark'}
            accent={accent}
            onClick={() => setVariant('dark')}
          />
          <VariantButton
            label="Light"
            icon={Sun}
            active={variant === 'light'}
            accent={accent}
            disabled={!supportsLight}
            onClick={() => setVariant('light')}
          />
        </div>
      </div>

      <ThemeGroup
        title="Popular"
        themes={popular}
        current={themeName}
        accent={accent}
        onSelect={setTheme}
      />
      <ThemeGroup
        title="Classic"
        themes={classic}
        current={themeName}
        accent={accent}
        onSelect={setTheme}
      />
      <ThemeGroup
        title="Experimental"
        themes={experimental}
        current={themeName}
        accent={accent}
        onSelect={setTheme}
      />

      <div className="mt-4 border-t border-zinc-800 pt-4">
        <div className="mb-2 text-xs font-medium text-zinc-400">Custom</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme('custom')}
            className={cn(
              'flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition-colors',
              themeName === 'custom'
                ? 'border-transparent'
                : 'border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
            )}
            style={
              themeName === 'custom'
                ? { backgroundColor: `${accent}1a`, color: accent, borderColor: `${accent}66` }
                : undefined
            }
          >
            <Palette size={12} />
            Custom theme
          </button>
          <button
            onClick={() => {
              setTheme('custom')
              setEditorOpen(true)
            }}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/30 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <Pencil size={12} />
            Edit colors
          </button>
        </div>
      </div>

      {editorOpen && <CustomThemeEditor onClose={() => setEditorOpen(false)} />}
    </SectionCard>
  )
}

function VariantButton({
  label,
  icon: Icon,
  active,
  accent,
  disabled,
  onClick
}: {
  label: string
  icon: LucideIcon
  active: boolean
  accent: string
  disabled?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors',
        active ? '' : 'text-zinc-400 hover:text-zinc-200',
        disabled && 'cursor-not-allowed opacity-40 hover:text-zinc-400'
      )}
      style={active ? { backgroundColor: `${accent}26`, color: accent } : undefined}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

function ThemeGroup({
  title,
  themes,
  current,
  accent,
  onSelect
}: {
  title: string
  themes: ThemeDefinition[]
  current: string
  accent: string
  onSelect: (id: string) => void
}): React.ReactElement {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 text-xs font-medium text-zinc-400">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {themes.map((theme) => {
          const active = current === theme.id
          return (
            <button
              key={theme.id}
              onClick={() => onSelect(theme.id)}
              className={cn(
                'rounded border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-transparent'
                  : 'border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-100'
              )}
              style={
                active
                  ? { backgroundColor: `${accent}1a`, color: accent, borderColor: `${accent}66` }
                  : undefined
              }
            >
              {theme.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
