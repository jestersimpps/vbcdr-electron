import { useThemeStore } from '@/stores/theme-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import { cn } from '@/lib/utils'

const DEFAULT_ACCENT = '#58a6ff'

export function useAccent(): string {
  const themeId = useThemeStore((s) => s.getFullThemeId())
  return getTerminalTheme(themeId).cursor ?? DEFAULT_ACCENT
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="text-meta font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

export function SectionCard({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function Toggle({
  enabled,
  onToggle,
  accent,
  ariaLabel
}: {
  enabled: boolean
  onToggle: () => void
  accent: string
  ariaLabel: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={enabled ? { backgroundColor: accent } : undefined}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors',
        'ring-1 ring-inset ring-white/10 hover:ring-white/25',
        'focus-visible:ring-2 focus-visible:ring-white/60',
        enabled ? '' : 'bg-zinc-700/60 hover:bg-zinc-700'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out',
          enabled ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

export function PrefToggle({
  label,
  description,
  enabled,
  onToggle,
  accent
}: {
  label: string
  description?: string
  enabled: boolean
  onToggle: () => void
  accent: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 py-1">
      <Toggle enabled={enabled} onToggle={onToggle} accent={accent} ariaLabel={`Toggle ${label}`} />
      <div className="flex flex-col">
        <span className="text-xs text-zinc-300">{label}</span>
        {description && <span className="text-meta text-zinc-500">{description}</span>}
      </div>
    </div>
  )
}
