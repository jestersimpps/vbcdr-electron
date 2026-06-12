import { cn } from '@/lib/utils'

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left'
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}): React.ReactElement {
  return (
    <th className={cn('py-1.5 font-medium', align === 'right' && 'text-right')}>
      <button
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-zinc-200 transition-colors',
          active ? 'text-zinc-200' : 'text-zinc-500'
        )}
      >
        {label}
        <span className="text-micro">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}
