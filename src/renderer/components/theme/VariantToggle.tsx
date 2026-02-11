import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import { getThemeById } from '@/config/theme-registry'

export function VariantToggle(): React.ReactElement | null {
  const variant = useThemeStore((s) => s.variant)
  const themeName = useThemeStore((s) => s.themeName)
  const toggleVariant = useThemeStore((s) => s.toggleVariant)

  const theme = getThemeById(themeName)

  if (!theme?.supportsLightMode) return null

  const Icon = variant === 'dark' ? Sun : Moon

  return (
    <button
      onClick={toggleVariant}
      className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      title={`Switch to ${variant === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon size={13} />
    </button>
  )
}
