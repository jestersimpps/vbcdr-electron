import { cn } from '@/lib/utils'

export const FLOW_INPUT_CLASS =
  'w-full rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-40'

export function Field({
  label,
  hint,
  className,
  children
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-micro font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
      {hint && <span className="text-meta text-zinc-600">{hint}</span>}
    </label>
  )
}

export function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'rounded p-1 text-zinc-500 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger ? 'hover:bg-red-950/40 hover:text-red-400' : 'hover:bg-zinc-800 hover:text-zinc-200'
      )}
    >
      {children}
    </button>
  )
}
