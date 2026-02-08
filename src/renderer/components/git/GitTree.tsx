import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGitStore } from '@/stores/git-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { getTerminalInstance } from '@/components/terminal/TerminalInstance'
import { GitBranch as GitBranchIcon, GitCommitHorizontal, Sparkles, RefreshCw, X } from 'lucide-react'
import type { GitCommit } from '@/models/types'

function sendToTerminal(tabId: string, text: string): void {
  const entry = getTerminalInstance(tabId)
  if (!entry) return
  entry.terminal.paste(text)
  setTimeout(() => {
    const textarea = entry.terminal.textarea
    if (!textarea) return
    textarea.focus()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
  }, 500)
}

const LANE_COLORS = [
  '#4ade80', // green
  '#60a5fa', // blue
  '#c084fc', // purple
  '#facc15', // yellow
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#a78bfa', // violet
  '#34d399', // emerald
  '#f87171', // red
]

const COL_WIDTH = 16
const ROW_HEIGHT = 36
const NODE_RADIUS = 4
const MERGE_RADIUS = 5

interface GraphRow {
  commit: GitCommit
  col: number
  color: string
  lines: GraphLine[]
}

interface GraphLine {
  fromCol: number
  fromRow: number
  toCol: number
  toRow: number
  color: string
}

function buildGraph(commits: GitCommit[]): GraphRow[] {
  const rows: GraphRow[] = []
  const hashToRow = new Map<string, number>()
  let lanes: (string | null)[] = []

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    hashToRow.set(commit.hash, i)

    let col = lanes.indexOf(commit.hash)
    if (col === -1) {
      col = lanes.indexOf(null)
      if (col === -1) {
        col = lanes.length
        lanes.push(commit.hash)
      } else {
        lanes[col] = commit.hash
      }
    }

    const color = LANE_COLORS[col % LANE_COLORS.length]
    const lines: GraphLine[] = []

    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] !== null && lanes[l] !== commit.hash) {
        lines.push({
          fromCol: l,
          fromRow: i,
          toCol: l,
          toRow: i + 1,
          color: LANE_COLORS[l % LANE_COLORS.length]
        })
      }
    }

    const [firstParent, ...otherParents] = commit.parents

    if (firstParent) {
      lanes[col] = firstParent
      lines.push({
        fromCol: col,
        fromRow: i,
        toCol: col,
        toRow: i + 1,
        color
      })
    } else {
      lanes[col] = null
    }

    for (const parent of otherParents) {
      let parentLane = lanes.indexOf(parent)
      if (parentLane === -1) {
        parentLane = lanes.indexOf(null)
        if (parentLane === -1) {
          parentLane = lanes.length
          lanes.push(parent)
        } else {
          lanes[parentLane] = parent
        }
      }
      lines.push({
        fromCol: col,
        fromRow: i,
        toCol: parentLane,
        toRow: i + 1,
        color: LANE_COLORS[parentLane % LANE_COLORS.length]
      })
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    rows.push({ commit, col, color, lines })
  }

  return rows
}

function GraphSvg({ rows }: { rows: GraphRow[] }): React.ReactElement {
  const maxCols = Math.max(1, ...rows.map((r) => Math.max(r.col + 1, ...r.lines.map((l) => Math.max(l.fromCol, l.toCol) + 1))))
  const width = maxCols * COL_WIDTH + 8

  return (
    <svg
      width={width}
      height={rows.length * ROW_HEIGHT}
      className="shrink-0"
      style={{ minWidth: width }}
    >
      {rows.map((row, i) => (
        <g key={row.commit.hash}>
          {row.lines.map((line, li) => {
            const x1 = line.fromCol * COL_WIDTH + COL_WIDTH / 2 + 4
            const y1 = line.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2
            const x2 = line.toCol * COL_WIDTH + COL_WIDTH / 2 + 4
            const y2 = line.toRow * ROW_HEIGHT + ROW_HEIGHT / 2

            if (x1 === x2) {
              return (
                <line
                  key={li}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={line.color}
                  strokeWidth={2}
                  strokeOpacity={0.7}
                />
              )
            }

            const midY = y1 + (y2 - y1) * 0.5
            return (
              <path
                key={li}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                stroke={line.color}
                strokeWidth={2}
                strokeOpacity={0.7}
                fill="none"
              />
            )
          })}

          <circle
            cx={row.col * COL_WIDTH + COL_WIDTH / 2 + 4}
            cy={i * ROW_HEIGHT + ROW_HEIGHT / 2}
            r={row.commit.parents.length > 1 ? MERGE_RADIUS : NODE_RADIUS}
            fill={row.color}
            stroke="#09090b"
            strokeWidth={2}
          />
        </g>
      ))}
    </svg>
  )
}

const REF_COLORS: Record<string, string> = {
  HEAD: 'bg-red-500/20 text-red-400 border-red-500/30',
  default: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/30'
}

function getRefColor(ref: string, index: number): string {
  if (ref.startsWith('HEAD')) return REF_COLORS.HEAD
  const c = LANE_COLORS[index % LANE_COLORS.length]
  return `border-[${c}]/30`
}

function RefBadge({ label, index }: { label: string; index: number }): React.ReactElement {
  const isHead = label.startsWith('HEAD')
  const base = isHead
    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
    : 'bg-zinc-700/30 text-zinc-400 border border-zinc-600/40'

  return (
    <span className={`inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight ${base}`}>
      {label}
    </span>
  )
}

export function GitTree(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })

  const activeTerminalTabId = useTerminalStore((s) => activeProjectId ? s.activeTabPerProject[activeProjectId] : undefined)

  const isRepo = useGitStore((s) => activeProjectId ? s.isRepoPerProject[activeProjectId] : false)
  const commits = useGitStore((s) => activeProjectId ? s.commitsPerProject[activeProjectId] : undefined)
  const branches = useGitStore((s) => activeProjectId ? s.branchesPerProject[activeProjectId] : undefined)
  const { loadGitData } = useGitStore()

  const [featureModalOpen, setFeatureModalOpen] = useState(false)
  const [featureDescription, setFeatureDescription] = useState('')
  const featureInputRef = useRef<HTMLInputElement>(null)

  const handleFeatureSubmit = useCallback(() => {
    if (!activeTerminalTabId || !featureDescription.trim()) return
    sendToTerminal(activeTerminalTabId, featureDescription.trim())
    setFeatureDescription('')
    setFeatureModalOpen(false)
  }, [activeTerminalTabId, featureDescription])

  useEffect(() => {
    if (featureModalOpen) setTimeout(() => featureInputRef.current?.focus(), 50)
  }, [featureModalOpen])

  useEffect(() => {
    if (!activeProject) return
    loadGitData(activeProject.id, activeProject.path)
  }, [activeProject?.id])

  const graphRows = useMemo(() => (commits ? buildGraph(commits) : []), [commits])
  const currentBranch = branches?.find((b) => b.current)

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Select a project
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Not a git repository
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <GitBranchIcon size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-400">Git</span>
          {currentBranch && (
            <span className="rounded bg-green-400/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
              {currentBranch.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            disabled={!activeTerminalTabId}
            onClick={() => activeTerminalTabId && sendToTerminal(activeTerminalTabId, '/commit')}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none"
          >
            <GitCommitHorizontal size={12} />
            <span>Commit</span>
          </button>
          <button
            disabled={!activeTerminalTabId}
            onClick={() => setFeatureModalOpen(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Sparkles size={12} />
            <span>New Feature</span>
          </button>
          <button
            onClick={() => activeProject && loadGitData(activeProject.id, activeProject.path)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ minHeight: graphRows.length * ROW_HEIGHT }}>
          <div className="absolute left-0 top-0">
            <GraphSvg rows={graphRows} />
          </div>

          <div className="relative" style={{ marginLeft: Math.max(1, ...graphRows.map((r) => Math.max(r.col + 1, ...r.lines.map((l) => Math.max(l.fromCol, l.toCol) + 1)))) * COL_WIDTH + 12 }}>
            {graphRows.map((row) => (
              <div
                key={row.commit.hash}
                className="flex items-center gap-2 pr-3 hover:bg-zinc-800/30"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {row.commit.refs.length > 0 &&
                      row.commit.refs.map((ref, ri) => (
                        <RefBadge key={ref} label={ref} index={ri} />
                      ))}
                    <span className="truncate text-xs text-zinc-300">{row.commit.message}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                    <span className="font-mono">{row.commit.shortHash}</span>
                    <span>{row.commit.author}</span>
                    <span>{row.commit.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {graphRows.length === 0 && (
          <div className="p-4 text-center text-xs text-zinc-600">No commits yet</div>
        )}
      </div>

      {featureModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">New Feature</span>
              <button
                onClick={() => { setFeatureModalOpen(false); setFeatureDescription('') }}
                className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X size={14} />
              </button>
            </div>
            <input
              ref={featureInputRef}
              type="text"
              value={featureDescription}
              onChange={(e) => setFeatureDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFeatureSubmit(); if (e.key === 'Escape') { setFeatureModalOpen(false); setFeatureDescription('') } }}
              placeholder="Describe the feature..."
              className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
            <button
              disabled={!featureDescription.trim()}
              onClick={handleFeatureSubmit}
              className="w-full rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none"
            >
              Send to Claude
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
