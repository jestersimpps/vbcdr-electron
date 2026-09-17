import { FileText, Terminal } from 'lucide-react'
import { Markdown } from '@/components/ui/Markdown'
import {
  ActivityLog,
  CheckBadges,
  DiffList,
  OutputReferencePanel,
  SECTION_LABEL
} from '@/components/sdlc/TicketStageParts'
import type { SdlcColumn, SdlcPanelConfig, SdlcPanelKind } from '@/models/sdlc-flow'
import type { SdlcTicket } from '@/models/sdlc'

export interface TicketPanelProps {
  ticket: SdlcTicket
  column: SdlcColumn
  config: SdlcPanelConfig
}

function panelOutput({ ticket, column, config }: TicketPanelProps): string | undefined {
  return ticket.artifacts.outputs[config.sourceColumnId ?? column.id]
}

function OutputPanel(props: TicketPanelProps): React.ReactElement | null {
  const { config } = props
  const output = panelOutput(props)
  if (!output) {
    return config.emptyText ? (
      <div className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
        {config.emptyText}
      </div>
    ) : null
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div className={SECTION_LABEL}>
        {config.format === 'raw' ? <Terminal size={11} /> : <FileText size={11} />}
        {config.label}
      </div>
      {config.format === 'raw' ? (
        <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-micro leading-relaxed text-zinc-400">
          {output}
        </pre>
      ) : (
        <Markdown
          content={output}
          className="min-h-0 overflow-auto rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
        />
      )}
    </div>
  )
}

/** Renders nothing while its source has no output, which also covers a source column that was since deleted. */
function ReferencePanel(props: TicketPanelProps): React.ReactElement | null {
  const output = panelOutput(props)
  return output ? <OutputReferencePanel label={props.config.label} content={output} /> : null
}

const PANELS: Record<SdlcPanelKind, (props: TicketPanelProps) => React.ReactElement | null> = {
  output: OutputPanel,
  reference: ReferencePanel,
  checks: ({ ticket }) => <CheckBadges checks={ticket.checks} />,
  diff: ({ ticket }) => <DiffList files={ticket.artifacts.diffFiles} />,
  activity: ({ ticket }) => <ActivityLog entries={ticket.artifacts.activity} />
}

export function TicketPanels({ ticket, column }: { ticket: SdlcTicket; column: SdlcColumn }): React.ReactElement {
  return (
    <>
      {column.panels.map((config) => {
        const Panel = PANELS[config.kind]
        return <Panel key={config.id} ticket={ticket} column={column} config={config} />
      })}
    </>
  )
}
