import { ExternalLink, GitPullRequest, History } from 'lucide-react'
import { CheckBadges, DiffList, SECTION_LABEL, relativeTime } from '@/components/sdlc/TicketStageParts'
import type { SdlcTicket } from '@/models/sdlc'

export function DoneBody({ ticket }: { ticket: SdlcTicket }): React.ReactElement {
  const { diffFiles, activity } = ticket.artifacts

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-zinc-200">{ticket.filesChanged}</div>
          <div className="text-micro uppercase tracking-wide text-zinc-500">files</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-emerald-400">+{ticket.linesAdded}</div>
          <div className="text-micro uppercase tracking-wide text-zinc-500">added</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-red-400">-{ticket.linesRemoved}</div>
          <div className="text-micro uppercase tracking-wide text-zinc-500">removed</div>
        </div>
      </div>

      {ticket.prUrl && (
        <a
          href={ticket.prUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
        >
          <GitPullRequest size={13} className="text-zinc-500" />
          <span className="flex-1 truncate">{ticket.prUrl}</span>
          <ExternalLink size={11} className="text-zinc-600" />
        </a>
      )}

      <CheckBadges checks={ticket.checks} />
      <DiffList files={diffFiles} />

      {activity.length > 0 && (
        <div>
          <div className={SECTION_LABEL}>
            <History size={11} />
            Activity
          </div>
          <div className="space-y-1">
            {activity.map((entry, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs text-zinc-400">
                <span className="shrink-0 text-micro text-zinc-600">{relativeTime(entry.at)}</span>
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
