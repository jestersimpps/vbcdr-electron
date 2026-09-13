import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PrState } from '@/models/types'

const STYLE: Record<PrState, { label: string; className: string }> = {
  none: { label: 'No PR', className: 'bg-zinc-800 text-zinc-400' },
  open: { label: 'PR open', className: 'bg-green-500/15 text-green-400' },
  merged: { label: 'Merged', className: 'bg-purple-500/15 text-purple-400' },
  closed: { label: 'PR closed', className: 'bg-zinc-700/60 text-zinc-300' },
  unknown: { label: 'PR ?', className: 'bg-zinc-800 text-zinc-500' }
}

export function PrStateBadge({ state, url }: { state: PrState; url: string | null }): React.ReactElement {
  const { label, className } = STYLE[state]
  const base = 'flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-micro font-medium'
  if (!url) return <span className={cn(base, className)}>{label}</span>
  return (
    <button
      onClick={() => window.api.worktrees.openUrl(url)}
      className={cn(base, className, 'hover:brightness-125')}
      title={url}
    >
      {label}
      <ExternalLink size={9} />
    </button>
  )
}
