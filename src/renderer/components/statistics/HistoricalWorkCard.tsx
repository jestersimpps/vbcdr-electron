import { SegmentedToggle, SegmentedToggleItem } from '@/components/ui/ToolbarButton'
import type { Session, SessionSource } from '@/lib/sessions'
import {
  computeHistoryStats,
  formatDateInput,
  parseDateInput,
  type HistoryCalendarData,
  type HistoryMetric,
  type HistoryRange,
  type HistoryView,
  type HistoryWindow
} from '@/lib/statistics-helpers'
import { DailyTimeline } from '@/components/statistics/DailyTimeline'
import { YearHeatmap } from '@/components/statistics/YearHeatmap'
import { SessionSettingsPopover } from '@/components/statistics/SessionSettingsPopover'

const SOURCE_OPTIONS: { key: SessionSource; label: string }[] = [
  { key: 'commits', label: 'Commits' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'both', label: 'Both' }
]

const HISTORY_WINDOWS: { key: HistoryWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' }
]

interface HistoricalWorkCardProps {
  calendar: HistoryCalendarData
  window: HistoryWindow
  setWindow: (w: HistoryWindow) => void
  metric: HistoryMetric
  setMetric: (m: HistoryMetric) => void
  view: HistoryView
  setView: (v: HistoryView) => void
  sessions: Session[]
  range: HistoryRange
  colorForProject: Record<string, string>
  projectId: string | null
  setProjectId: (id: string | null) => void
  projects: { id: string; name: string }[]
  fromMs: number | null
  setFromMs: (ms: number | null) => void
  toMs: number | null
  setToMs: (ms: number | null) => void
  baseColor: string
  emptyColor: string
  source: SessionSource
  setSource: (s: SessionSource) => void
  includeAllAuthors: boolean
  setIncludeAllAuthors: (v: boolean) => void
  gapMinutes: number
  setGapMinutes: (v: number) => void
  leadInMinutes: number
  setLeadInMinutes: (v: number) => void
  idleMinutes: number
  setIdleMinutes: (v: number) => void
  minSessionMinutes: number
  setMinSessionMinutes: (v: number) => void
}

export function HistoricalWorkCard({
  calendar,
  window: historyWindow,
  setWindow,
  metric,
  setMetric,
  view,
  setView,
  sessions,
  range,
  colorForProject,
  projectId,
  setProjectId,
  projects,
  fromMs,
  setFromMs,
  toMs,
  setToMs,
  baseColor,
  emptyColor,
  source,
  setSource,
  includeAllAuthors,
  setIncludeAllAuthors,
  gapMinutes,
  setGapMinutes,
  leadInMinutes,
  setLeadInMinutes,
  idleMinutes,
  setIdleMinutes,
  minSessionMinutes,
  setMinSessionMinutes
}: HistoricalWorkCardProps): React.ReactElement {
  const hasCells = calendar.weeks.length > 0 && computeHistoryStats(calendar).possibleDays > 0

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-zinc-400">Historical work</div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle>
            {SOURCE_OPTIONS.map((o) => (
              <SegmentedToggleItem
                key={o.key}
                onClick={() => setSource(o.key)}
                active={source === o.key}
              >
                {o.label}
              </SegmentedToggleItem>
            ))}
          </SegmentedToggle>
          <SegmentedToggle>
            {HISTORY_WINDOWS.map((w) => (
              <SegmentedToggleItem
                key={w.key}
                onClick={() => setWindow(w.key)}
                active={historyWindow === w.key}
              >
                {w.label}
              </SegmentedToggleItem>
            ))}
          </SegmentedToggle>
          <SegmentedToggle>
            <SegmentedToggleItem onClick={() => setView('timeline')} active={view === 'timeline'}>
              Timeline
            </SegmentedToggleItem>
            <SegmentedToggleItem onClick={() => setView('heatmap')} active={view === 'heatmap'}>
              Heatmap
            </SegmentedToggleItem>
          </SegmentedToggle>
          {view === 'heatmap' && (
            <SegmentedToggle>
              <SegmentedToggleItem onClick={() => setMetric('hours')} active={metric === 'hours'}>
                Hours
              </SegmentedToggleItem>
              <SegmentedToggleItem onClick={() => setMetric('commits')} active={metric === 'commits'}>
                Commits
              </SegmentedToggleItem>
            </SegmentedToggle>
          )}
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-meta text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <SessionSettingsPopover
            source={source}
            includeAllAuthors={includeAllAuthors}
            setIncludeAllAuthors={setIncludeAllAuthors}
            gapMinutes={gapMinutes}
            setGapMinutes={setGapMinutes}
            leadInMinutes={leadInMinutes}
            setLeadInMinutes={setLeadInMinutes}
            idleMinutes={idleMinutes}
            setIdleMinutes={setIdleMinutes}
            minSessionMinutes={minSessionMinutes}
            setMinSessionMinutes={setMinSessionMinutes}
          />
        </div>
      </div>

      {historyWindow === 'custom' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-meta text-zinc-400">
          <span>From</span>
          <input
            type="date"
            value={fromMs !== null ? formatDateInput(fromMs) : ''}
            max={toMs !== null ? formatDateInput(toMs) : undefined}
            onChange={(e) => setFromMs(parseDateInput(e.target.value))}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          />
          <span>to</span>
          <input
            type="date"
            value={toMs !== null ? formatDateInput(toMs) : ''}
            min={fromMs !== null ? formatDateInput(fromMs) : undefined}
            max={formatDateInput(Date.now())}
            onChange={(e) => setToMs(parseDateInput(e.target.value))}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          />
        </div>
      )}

      {view === 'timeline' ? (
        <DailyTimeline
          sessions={sessions}
          range={range}
          colorForProject={colorForProject}
          emptyColor={emptyColor}
        />
      ) : hasCells ? (
        <YearHeatmap calendar={calendar} baseColor={baseColor} emptyColor={emptyColor} />
      ) : (
        <div className="py-6 text-center text-xs text-zinc-500">No activity in this window</div>
      )}
    </div>
  )
}
