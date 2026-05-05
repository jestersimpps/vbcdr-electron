import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'active' | 'accent' | 'accentActive'

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  density?: 'segment' | 'standalone'
}

const VARIANT_CLASSES: Record<Variant, string> = {
  default: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
  active: 'bg-zinc-700 text-zinc-100',
  accent: 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
  accentActive: 'bg-emerald-600 text-white hover:bg-emerald-500'
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ variant = 'default', density = 'standalone', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded text-[11px] font-medium leading-[1.4] transition-colors',
        density === 'segment' ? 'px-2 py-0.5' : 'h-7 px-2',
        VARIANT_CLASSES[variant],
        'disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600',
        className
      )}
      {...props}
    />
  )
)

ToolbarButton.displayName = 'ToolbarButton'

interface SegmentedToggleProps {
  className?: string
  children: React.ReactNode
}

export function SegmentedToggle({ className, children }: SegmentedToggleProps): React.ReactElement {
  return (
    <div className={cn('flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5', className)}>
      {children}
    </div>
  )
}

interface SegmentedToggleItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export function SegmentedToggleItem({
  active = false,
  className,
  type = 'button',
  ...props
}: SegmentedToggleItemProps): React.ReactElement {
  return (
    <button
      type={type}
      className={cn(
        'rounded px-2 py-0.5 text-[11px] font-medium leading-[1.4] transition-colors',
        active ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200',
        className
      )}
      {...props}
    />
  )
}
