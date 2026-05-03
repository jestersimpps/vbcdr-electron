import { useEffect, useMemo, useState } from 'react'
import { useGitStore } from '@/stores/git-store'
import { useProjectStore } from '@/stores/project-store'
import { useDiffViewStore } from '@/stores/diff-view-store'
import { useEditorStore } from '@/stores/editor-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { sendToTerminalViaPty } from '@/lib/send-to-terminal'
import { GitBranch as GitBranchIcon, ArrowDown, ArrowUp, GitMerge, RefreshCw, FileDiff, GitCommit as GitCommitIcon, Loader2 } from 'lucide-react'
import type { GitCommit } from '@/models/types'
import { BranchSwitcher } from '@/components/git/BranchSwitcher'

const LANE_COLORS = [
  '#4ade80',
  '#60a5fa',
  '#c084fc',
  '#facc15',
  '#f472b6',
  '#22d3ee',
  '#fb923c',
  '#a78bfa',
  '#34d399',
  '#f87171',
]

const COL_WIDTH = 14
const ROW_HEIGHT = 32
const NODE_RADIUS = 3
const MERGE_RADIUS = 4

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

function RefBadge({ label, index }: { label: string; index: number }): React.ReactElement {
  const isHead = label.startsWith('HEAD')
  const isTag = label.startsWith('tag:')
  const base = isHead
    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
    : isTag
    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
    : 'bg-zinc-700/30 text-zinc-400 border border-zinc-600/40'

  const displayLabel = label.startsWith('tag: ') ? label.slice(5) : label

  return (
    <span className={`shrink-0 inline-flex items-center rounded px-1 py-px text-[9px] font-medium leading-tight max-w-[80px] truncate ${base}`}>
      {displayLabel}
    </span>
  )
}

interface GitTreeProps {
  projectId?: string
  cwd?: string
}

export function GitTree({ projectId, cwd }: GitTreeProps = {}): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })

  const effectiveProjectId = projectId ?? activeProjectId
  const effectivePath = cwd ?? activeProject?.path

  const isRepo = useGitStore((s) => effectiveProjectId ? s.isRepoPerProject[effectiveProjectId] : false)
  const commits = useGitStore((s) => effectiveProjectId ? s.commitsPerProject[effectiveProjectId] : undefined)
  const drift = useGitStore((s) => effectiveProjectId ? s.driftPerProject[effectiveProjectId] : undefined)
  const pullAction = useGitStore((s) => s.pull)
  const pushAction = useGitStore((s) => s.push)
  const isPushing = useGitStore((s) => effectiveProjectId ? s.pushingPerProject[effectiveProjectId] ?? false : false)
  const rebaseAction = useGitStore((s) => s.rebaseRemote)
  const loadStatus = useGitStore((s) => s.loadStatus)
  const showCommit = useDiffViewStore((s) => s.showCommit)
  const showWorking = useDiffViewStore((s) => s.showWorking)
  const setCenterTab = useEditorStore((s) => s.setCenterTab)
  const statusMap = useGitStore((s) => effectiveProjectId ? s.statusPerProject[effectiveProjectId] : undefined)
  const { loadGitData } = useGitStore()

  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const handleCommitClick = (commit: GitCommit): void => {
    if (!effectiveProjectId) return
    showCommit(effectiveProjectId, commit.hash, commit.shortHash, commit.message)
    setCenterTab(effectiveProjectId, 'diff')
  }

  const workingPaths = useMemo<string[]>(() => {
    if (!statusMap || !effectivePath) return []
    const allPaths = Object.keys(statusMap).filter((p) => p !== effectivePath)
    return allPaths.filter(
      (p) => !allPaths.some((other) => other !== p && other.startsWith(p + '/'))
    )
  }, [statusMap, effectivePath])

  const workingCount = workingPaths.length

  const handleWorkingClick = (): void => {
    if (!effectiveProjectId) return
    showWorking(effectiveProjectId)
    setCenterTab(effectiveProjectId, 'diff')
  }

  const llmCommit = (): void => {
    if (!effectiveProjectId || !effectivePath) return
    const tState = useTerminalStore.getState()
    const llmTab = tState.tabs.find((t) => t.projectId === effectiveProjectId && !!t.initialCommand)
    if (!llmTab) {
      setCommitError('No LLM tab found in this project')
      return
    }
    tState.setActiveTab(effectiveProjectId, llmTab.id)
    setCenterTab(effectiveProjectId, 'terminals')
    const fileList = workingPaths
      .map((p) => `- ${p.startsWith(effectivePath + '/') ? p.slice(effectivePath.length + 1) : p} (${statusMap?.[p] ?? '?'})`)
      .join('\n')
    const message = fileList
      ? `commit the following changes:\n${fileList}`
      : 'commit the current changes'
    sendToTerminalViaPty(llmTab.id, message)
  }

  const handleCommit = async (): Promise<void> => {
    if (committing || !effectiveProjectId || !effectivePath) return
    if (workingPaths.length === 0) return
    const message = commitMessage.trim()
    if (!message) {
      llmCommit()
      return
    }
    setCommitting(true)
    setCommitError(null)
    const result = await window.api.git.commitAll(effectivePath, message)
    setCommitting(false)
    if (!result.success) {
      setCommitError(result.error ?? 'Commit failed')
      return
    }
    setCommitMessage('')
    setCommitOpen(false)
    await loadStatus(effectiveProjectId, effectivePath)
    await loadGitData(effectiveProjectId, effectivePath)
  }

  useEffect(() => {
    if (!effectiveProjectId || !effectivePath) return
    loadGitData(effectiveProjectId, effectivePath)
    loadStatus(effectiveProjectId, effectivePath)
  }, [effectiveProjectId, effectivePath])

  const graphRows = useMemo(() => (commits ? buildGraph(commits) : []), [commits])
  const graphWidth = useMemo(() => {
    if (graphRows.length === 0) return COL_WIDTH + 8
    const maxCols = Math.max(1, ...graphRows.map((r) => Math.max(r.col + 1, ...r.lines.map((l) => Math.max(l.fromCol, l.toCol) + 1))))
    return maxCols * COL_WIDTH + 12
  }, [graphRows])

  if (!effectiveProjectId || !effectivePath) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        {projectId ? 'Loading…' : 'Select a project'}
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
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <GitBranchIcon size={13} className="shrink-0 text-zinc-500" />
          <span className="shrink-0 text-[11px] text-zinc-400">Git</span>
          <BranchSwitcher projectId={effectiveProjectId} cwd={effectivePath} />
          {drift && drift.behind > 0 && !drift.diverged && (
            <button
              onClick={() => pullAction(effectiveProjectId, effectivePath)}
              className="flex shrink-0 items-center gap-0.5 rounded bg-blue-500/15 px-1 py-px text-[10px] font-medium text-blue-400 hover:bg-blue-500/25"
              title={`${drift.behind} commit${drift.behind > 1 ? 's' : ''} behind ${drift.remoteBranch ?? 'remote'}, click to pull`}
            >
              <ArrowDown size={9} />
              <span>{drift.behind}</span>
            </button>
          )}
          {drift && drift.ahead > 0 && !drift.diverged && (
            <button
              onClick={async () => {
                const result = await pushAction(effectiveProjectId, effectivePath)
                if (result && /error|rejected|failed/i.test(result)) {
                  console.error('git push failed:', result)
                }
              }}
              disabled={isPushing}
              className="flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-px text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
              title={`${drift.ahead} commit${drift.ahead > 1 ? 's' : ''} ahead of ${drift.remoteBranch ?? 'remote'}, click to push`}
            >
              {isPushing ? <Loader2 size={9} className="animate-spin" /> : <ArrowUp size={9} />}
              <span>{drift.ahead}</span>
            </button>
          )}
          {drift?.diverged && (
            <button
              onClick={() => rebaseAction(effectiveProjectId, effectivePath)}
              className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-400 hover:bg-amber-500/25"
              title={`Diverged: ${drift.ahead} ahead, ${drift.behind} behind, click to rebase`}
            >
              <GitMerge size={9} />
              <span>{drift.ahead}/{drift.behind}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {projectId && (
            <span className="mr-1 rounded bg-purple-500/15 px-1 py-px text-[9px] font-medium text-purple-400">
              ~/.claude
            </span>
          )}
          <button
            onClick={() => loadGitData(effectiveProjectId, effectivePath)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {workingCount > 0 && (
        <div className="border-b border-zinc-800 bg-emerald-500/5">
          <div className="flex items-center hover:bg-emerald-500/10">
            <button
              onClick={handleWorkingClick}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
              title="Show diff for uncommitted changes"
            >
              <FileDiff size={12} className="shrink-0 text-emerald-400" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-200">Working changes</span>
              <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-400">
                {workingCount} file{workingCount === 1 ? '' : 's'}
              </span>
            </button>
            <button
              onClick={() => {
                setCommitError(null)
                setCommitOpen((v) => !v)
              }}
              className={`mr-1 shrink-0 rounded p-1 hover:bg-zinc-800 ${
                commitOpen ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={commitOpen ? 'Hide commit form' : 'Commit working changes'}
            >
              <GitCommitIcon size={12} />
            </button>
          </div>
          {commitOpen && (
            <div className="border-t border-zinc-800/50 px-2 py-1.5">
              {commitError && (
                <div className="mb-1 truncate text-[10px] text-red-400" title={commitError}>
                  {commitError}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleCommit()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setCommitOpen(false)
                    }
                  }}
                  placeholder="Commit message — empty for LLM commit"
                  disabled={committing}
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
                />
                <button
                  onClick={handleCommit}
                  disabled={committing || workingCount === 0}
                  className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    commitMessage.trim()
                      ? `Commit ${workingCount} file${workingCount === 1 ? '' : 's'}`
                      : 'Have the LLM commit the current changes'
                  }
                >
                  <GitCommitIcon size={11} />
                  <span>{committing ? 'Committing…' : commitMessage.trim() ? 'Commit' : 'LLM commit'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ minHeight: graphRows.length * ROW_HEIGHT }}>
          <div className="absolute left-0 top-0">
            <GraphSvg rows={graphRows} />
          </div>

          <div className="relative" style={{ marginLeft: graphWidth }}>
            {graphRows.map((row) => (
              <div
                key={row.commit.hash}
                className="flex cursor-pointer items-center pr-2 hover:bg-zinc-800/30"
                style={{ height: ROW_HEIGHT }}
                onClick={() => handleCommitClick(row.commit)}
                title="Show diff for this commit"
              >
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-1 overflow-hidden">
                    {row.commit.refs.length > 0 &&
                      row.commit.refs.slice(0, 2).map((ref, ri) => (
                        <RefBadge key={ref} label={ref} index={ri} />
                      ))}
                    {row.commit.refs.length > 2 && (
                      <span className="shrink-0 text-[9px] text-zinc-500">+{row.commit.refs.length - 2}</span>
                    )}
                    <span className="truncate text-[11px] leading-tight text-zinc-300">{row.commit.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-hidden text-[9px] text-zinc-500">
                    <span className="shrink-0 font-mono">{row.commit.shortHash}</span>
                    <span className="truncate">{row.commit.author}</span>
                    <span className="shrink-0">{row.commit.date}</span>
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
    </div>
  )
}
