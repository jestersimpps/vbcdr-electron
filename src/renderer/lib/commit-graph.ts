import type { GitCommit } from '@/models/types'

export const LANE_COLORS = [
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

export const COL_WIDTH = 14
export const ROW_HEIGHT = 32
export const NODE_RADIUS = 3
export const MERGE_RADIUS = 4

/** Hard cap on drawn lanes, so the graph gutter can never push commit text out of the panel. */
export const MAX_GRAPH_COLS = 8

export interface GraphLine {
  fromCol: number
  fromRow: number
  toCol: number
  toRow: number
  color: string
}

export interface GraphRow {
  commit: GitCommit
  col: number
  color: string
  lines: GraphLine[]
}

export function laneColor(col: number): string {
  return LANE_COLORS[col % LANE_COLORS.length]
}

/** Horizontal centre of a lane, clamped so out-of-cap lanes stay visible. */
export function colX(col: number): number {
  return Math.min(col, MAX_GRAPH_COLS - 1) * COL_WIDTH + COL_WIDTH / 2 + 4
}

/** Lanes actually drawn, clamped to MAX_GRAPH_COLS. */
export function graphColumnCount(rows: GraphRow[]): number {
  let max = 1
  for (const row of rows) {
    max = Math.max(max, row.col + 1)
    for (const line of row.lines) {
      max = Math.max(max, line.fromCol + 1, line.toCol + 1)
    }
  }
  return Math.min(max, MAX_GRAPH_COLS)
}

export function buildGraph(commits: GitCommit[]): GraphRow[] {
  const rows: GraphRow[] = []
  // `git log --all --max-count=N` truncates at N commits across every ref, so
  // most rows are branch tips whose parents are not drawn. A lane parked on a
  // parent outside this window would stay occupied for every later row, giving
  // each tip its own lane — a staircase that pushes commit text off-screen.
  const rendered = new Set(commits.map((c) => c.hash))
  const lanes: (string | null)[] = []

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]

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

    const color = laneColor(col)
    const lines: GraphLine[] = []

    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] !== null && lanes[l] !== commit.hash) {
        lines.push({ fromCol: l, fromRow: i, toCol: l, toRow: i + 1, color: laneColor(l) })
      }
    }

    const [firstParent, ...otherParents] = commit.parents

    if (firstParent !== undefined && rendered.has(firstParent)) {
      lanes[col] = firstParent
      lines.push({ fromCol: col, fromRow: i, toCol: col, toRow: i + 1, color })
    } else {
      lanes[col] = null
    }

    for (const parent of otherParents) {
      if (!rendered.has(parent)) continue
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
        color: laneColor(parentLane)
      })
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    rows.push({ commit, col, color, lines })
  }

  return rows
}
