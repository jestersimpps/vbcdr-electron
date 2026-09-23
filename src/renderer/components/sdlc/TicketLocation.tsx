import { FolderOpen, GitBranch } from 'lucide-react'
import { PrStateBadge } from '@/components/git/PrStateBadge'
import { useWorktreeStore } from '@/stores/worktree-store'
import type { SdlcTicket } from '@/models/sdlc'

const ROW = 'flex min-w-0 items-center gap-1 text-micro text-zinc-500'

function prNumber(url: string): string | null {
  return url.match(/\/pull\/(\d+)/)?.[1] ?? null
}

/**
 * Where the ticket's work lives right now: the branch, the worktree while it
 * has one, and the pull request once there is one. The worktree comes from the
 * tracked list rather than the ticket, so a folder that is gone is never shown.
 */
export function TicketLocation({ ticket }: { ticket: SdlcTicket }): React.ReactElement | null {
  const worktree = useWorktreeStore((s) => (ticket.worktreeId ? s.find(ticket.worktreeId) : undefined))
  const hasBranch = ticket.branch !== '—'
  if (!hasBranch && !worktree && !ticket.prUrl) return null

  return (
    <div className="mb-1.5 flex flex-col gap-0.5">
      {hasBranch && (
        <div className={ROW} title={ticket.branch}>
          <GitBranch size={10} className="shrink-0" />
          <span className="truncate font-mono">{ticket.branch}</span>
        </div>
      )}
      {worktree && (
        <button
          onClick={() => void window.api.fs.openFolder(worktree.path)}
          className={`${ROW} text-left hover:text-zinc-300`}
          title={`Open ${worktree.path}`}
        >
          <FolderOpen size={10} className="shrink-0" />
          <span className="truncate font-mono">{worktree.path.split('/.worktrees/')[1] ?? worktree.path}</span>
        </button>
      )}
      {ticket.prUrl && (
        <div className="flex">
          <PrStateBadge state={ticket.prState ?? 'unknown'} url={ticket.prUrl} number={prNumber(ticket.prUrl)} />
        </div>
      )}
    </div>
  )
}
