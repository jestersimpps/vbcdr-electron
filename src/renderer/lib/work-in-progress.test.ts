import { describe, it, expect } from 'vitest'
import {
  toWipProject,
  rankWipProjects,
  hasOpenWork,
  summarizeChangedAreas,
  type WipProjectInput,
  type WipProject
} from './work-in-progress'

function input(over: Partial<WipProjectInput>): WipProjectInput {
  return {
    projectId: 'p',
    projectName: 'proj',
    branch: 'main',
    llmStatus: 'none',
    llmSessionCount: 0,
    status: undefined,
    drift: undefined,
    lastActivityMs: 0,
    ...over
  }
}

function wip(over: Partial<WipProject>): WipProject {
  return {
    projectId: 'p',
    projectName: 'proj',
    branch: 'main',
    llmStatus: 'none',
    llmSessionCount: 0,
    changedFiles: 0,
    conflicts: 0,
    ahead: 0,
    behind: 0,
    lastActivityMs: 0,
    isClean: true,
    ...over
  }
}

describe('toWipProject', () => {
  it('counts changed files and conflicts from git status', () => {
    const p = toWipProject(
      input({ status: { 'a.ts': 'modified', 'b.ts': 'added', 'c.ts': 'conflict' } })
    )
    expect(p.changedFiles).toBe(3)
    expect(p.conflicts).toBe(1)
    expect(p.isClean).toBe(false)
  })

  it('reads ahead and behind from drift', () => {
    const p = toWipProject(input({ drift: { ahead: 2, behind: 5 } as never }))
    expect(p.ahead).toBe(2)
    expect(p.behind).toBe(5)
    expect(p.isClean).toBe(false)
  })

  it('is clean with no status and no drift', () => {
    expect(toWipProject(input({})).isClean).toBe(true)
  })
})

describe('rankWipProjects', () => {
  it('puts busy LLM sessions first, then idle, then none', () => {
    const ranked = rankWipProjects([
      wip({ projectId: 'none', llmStatus: 'none' }),
      wip({ projectId: 'idle', llmStatus: 'idle' }),
      wip({ projectId: 'busy', llmStatus: 'busy' })
    ])
    expect(ranked.map((p) => p.projectId)).toEqual(['busy', 'idle', 'none'])
  })

  it('falls back to conflicts, then dirty files, then drift', () => {
    const ranked = rankWipProjects([
      wip({ projectId: 'drift', ahead: 4, isClean: false }),
      wip({ projectId: 'dirty', changedFiles: 2, isClean: false }),
      wip({ projectId: 'conflict', conflicts: 1, changedFiles: 1, isClean: false })
    ])
    expect(ranked.map((p) => p.projectId)).toEqual(['conflict', 'dirty', 'drift'])
  })

  it('ranks more dirty files above fewer', () => {
    const ranked = rankWipProjects([
      wip({ projectId: 'few', changedFiles: 1, isClean: false }),
      wip({ projectId: 'many', changedFiles: 9, isClean: false })
    ])
    expect(ranked.map((p) => p.projectId)).toEqual(['many', 'few'])
  })

  it('breaks remaining ties by recency then name', () => {
    const ranked = rankWipProjects([
      wip({ projectId: 'old', projectName: 'a', lastActivityMs: 10 }),
      wip({ projectId: 'new', projectName: 'z', lastActivityMs: 99 })
    ])
    expect(ranked.map((p) => p.projectId)).toEqual(['new', 'old'])
  })

  it('does not mutate the input array', () => {
    const list = [wip({ projectId: 'a' }), wip({ projectId: 'b', llmStatus: 'busy' })]
    const copy = [...list]
    rankWipProjects(list)
    expect(list).toEqual(copy)
  })
})

describe('hasOpenWork', () => {
  it('is true when an LLM session exists or the tree is not clean', () => {
    expect(hasOpenWork(wip({ llmStatus: 'idle' }))).toBe(true)
    expect(hasOpenWork(wip({ changedFiles: 1, isClean: false }))).toBe(true)
    expect(hasOpenWork(wip({}))).toBe(false)
  })
})

describe('summarizeChangedAreas', () => {
  const cwd = '/p/alpha'

  it('groups changed files by their meaningful folder', () => {
    const areas = summarizeChangedAreas(
      {
        '/p/alpha/src/components/Button.tsx': 'modified',
        '/p/alpha/src/components/Modal.tsx': 'modified',
        '/p/alpha/src/stores/user.ts': 'added'
      },
      cwd
    )
    expect(areas[0]).toBe('components')
    expect(areas).toContain('stores')
  })

  it('skips generic wrapper folders like src and app', () => {
    const areas = summarizeChangedAreas({ '/p/alpha/src/api/user.ts': 'modified' }, cwd)
    expect(areas).toEqual(['api'])
  })

  it('ranks the busiest area first', () => {
    const areas = summarizeChangedAreas(
      {
        '/p/alpha/src/rare/a.ts': 'modified',
        '/p/alpha/src/busy/a.ts': 'modified',
        '/p/alpha/src/busy/b.ts': 'modified',
        '/p/alpha/src/busy/c.ts': 'modified'
      },
      cwd
    )
    expect(areas[0]).toBe('busy')
  })

  it('labels top-level files as root', () => {
    expect(summarizeChangedAreas({ '/p/alpha/README.md': 'modified' }, cwd)).toEqual(['root'])
  })

  it('caps the number of areas returned', () => {
    const status: Record<string, 'modified'> = {}
    for (const n of ['a', 'b', 'c', 'd', 'e']) status[`/p/alpha/src/${n}/f.ts`] = 'modified'
    expect(summarizeChangedAreas(status, cwd)).toHaveLength(3)
  })

  it('returns nothing when there is no status', () => {
    expect(summarizeChangedAreas(undefined, cwd)).toEqual([])
  })
})
