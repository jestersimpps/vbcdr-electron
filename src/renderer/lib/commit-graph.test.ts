import { describe, it, expect } from 'vitest'
import {
  buildGraph,
  graphColumnCount,
  colX,
  COL_WIDTH,
  MAX_GRAPH_COLS
} from '@/lib/commit-graph'
import type { GitCommit } from '@/models/types'

function commit(hash: string, parents: string[] = []): GitCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    message: `msg ${hash}`,
    author: 'A',
    date: '1 hour ago',
    refs: [],
    parents
  }
}

/** Branch tips from `git log --all --max-count=N`: parents fall outside the window. */
function detachedTips(n: number): GitCommit[] {
  return Array.from({ length: n }, (_, i) => commit(`tip${i}`, [`parent-outside-${i}`]))
}

describe('buildGraph', () => {
  it('keeps a linear history in one lane', () => {
    const rows = buildGraph([commit('c', ['b']), commit('b', ['a']), commit('a')])
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0])
    expect(graphColumnCount(rows)).toBe(1)
  })

  it('reuses lane 0 for branch tips whose parents are outside the window', () => {
    const rows = buildGraph(detachedTips(50))
    expect(rows.map((r) => r.col)).toEqual(Array(50).fill(0))
    expect(graphColumnCount(rows)).toBe(1)
  })

  it('draws no dangling line below a commit whose parent is not rendered', () => {
    const rows = buildGraph(detachedTips(3))
    expect(rows.flatMap((r) => r.lines)).toEqual([])
  })

  it('still carries a lane down to a parent inside the window', () => {
    // tip -> deep, with an unrelated tip rendered between them.
    const rows = buildGraph([
      commit('tip', ['deep']),
      commit('other', ['outside']),
      commit('deep')
    ])
    expect(rows.map((r) => r.col)).toEqual([0, 1, 0])
    // Row 0 carries lane 0 down; row 1 must keep lane 0 alive past it.
    expect(rows[1].lines).toContainEqual({
      fromCol: 0,
      fromRow: 1,
      toCol: 0,
      toRow: 2,
      color: rows[0].color
    })
  })

  it('opens a second lane for a merge whose other parent is rendered', () => {
    const rows = buildGraph([
      commit('m', ['a', 'b']),
      commit('a', ['base']),
      commit('b', ['base']),
      commit('base')
    ])
    expect(rows[0].lines.some((l) => l.fromCol !== l.toCol)).toBe(true)
    expect(graphColumnCount(rows)).toBeGreaterThan(1)
  })

  it('ignores a merge parent that is not rendered', () => {
    const rows = buildGraph([commit('m', ['a', 'outside']), commit('a')])
    expect(graphColumnCount(rows)).toBe(1)
  })
})

describe('graph gutter width', () => {
  it('never exceeds the lane cap, however many lanes a repo needs', () => {
    // Force one live lane per row: every commit's parent is the last commit.
    const last = commit('last')
    const forked = Array.from({ length: 40 }, (_, i) => commit(`f${i}`, ['last']))
    const rows = buildGraph([...forked, last])
    expect(graphColumnCount(rows)).toBe(MAX_GRAPH_COLS)
    expect(graphColumnCount(rows) * COL_WIDTH + 12).toBeLessThanOrEqual(
      MAX_GRAPH_COLS * COL_WIDTH + 12
    )
  })

  it('clamps out-of-cap lanes to the last visible column', () => {
    expect(colX(MAX_GRAPH_COLS + 5)).toBe(colX(MAX_GRAPH_COLS - 1))
  })
})
