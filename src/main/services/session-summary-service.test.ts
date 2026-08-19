import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let tmpHome: string

async function loadService(): Promise<typeof import('./session-summary-service')> {
  vi.resetModules()
  return import('./session-summary-service')
}

function writeClaudeSession(projectPath: string, name: string, lines: object[]): void {
  const slug = path.resolve(projectPath).replace(/\//g, '-')
  const dir = path.join(tmpHome, '.claude', 'projects', slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, `${name}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join('\n')
  )
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vbcdr-sess-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('getAgentSessions', () => {
  it('prefers the ai-title over the first user message', async () => {
    writeClaudeSession('/p/alpha', 's1', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: 'do a thing' } },
      { type: 'ai-title', aiTitle: 'Refactor the auth flow' },
      { type: 'assistant', timestamp: '2026-05-15T10:05:00Z' }
    ])

    const { getAgentSessions } = await loadService()
    const out = await getAgentSessions(['/p/alpha'], null)

    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Refactor the auth flow')
    expect(out[0].agent).toBe('claude')
    expect(out[0].projectPath).toBe('/p/alpha')
    expect(out[0].userTurns).toBe(1)
  })

  it('falls back to the first user message when there is no ai-title', async () => {
    writeClaudeSession('/p/alpha', 's1', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: '  fix   the  bug  ' } }
    ])

    const { getAgentSessions } = await loadService()
    const out = await getAgentSessions(['/p/alpha'], null)
    expect(out[0].title).toBe('fix the bug')
  })

  it('derives start and end from timestamps', async () => {
    writeClaudeSession('/p/alpha', 's1', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: 'hi' } },
      { type: 'assistant', timestamp: '2026-05-15T12:30:00Z' }
    ])

    const { getAgentSessions } = await loadService()
    const out = await getAgentSessions(['/p/alpha'], null)
    expect(out[0].start).toBe(Date.parse('2026-05-15T10:00:00Z'))
    expect(out[0].end).toBe(Date.parse('2026-05-15T12:30:00Z'))
  })

  it('skips sessions with no user turns', async () => {
    writeClaudeSession('/p/alpha', 's1', [
      { type: 'ai-title', aiTitle: 'Ghost session' },
      { type: 'assistant', timestamp: '2026-05-15T10:00:00Z' }
    ])

    const { getAgentSessions } = await loadService()
    expect(await getAgentSessions(['/p/alpha'], null)).toHaveLength(0)
  })

  it('ignores projects that were not requested', async () => {
    writeClaudeSession('/p/other', 's1', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: 'hi' } }
    ])

    const { getAgentSessions } = await loadService()
    expect(await getAgentSessions(['/p/alpha'], null)).toHaveLength(0)
  })

  it('filters out sessions that ended before the since bound', async () => {
    writeClaudeSession('/p/alpha', 'old', [
      { type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { role: 'user', content: 'old' } }
    ])
    writeClaudeSession('/p/alpha', 'new', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: 'new' } }
    ])

    const { getAgentSessions } = await loadService()
    const out = await getAgentSessions(['/p/alpha'], '2026-05-01T00:00:00Z')
    expect(out.map((s) => s.title)).toEqual(['new'])
  })

  it('tolerates malformed lines and a missing project directory', async () => {
    writeClaudeSession('/p/alpha', 's1', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: 'hi' } }
    ])
    const slug = path.resolve('/p/alpha').replace(/\//g, '-')
    fs.appendFileSync(
      path.join(tmpHome, '.claude', 'projects', slug, 's1.jsonl'),
      '\nnot json at all\n'
    )

    const { getAgentSessions } = await loadService()
    const out = await getAgentSessions(['/p/alpha', '/p/does-not-exist'], null)
    expect(out).toHaveLength(1)
  })

  it('sorts most recent first', async () => {
    writeClaudeSession('/p/alpha', 'a', [
      { type: 'user', timestamp: '2026-05-10T10:00:00Z', message: { role: 'user', content: 'older' } }
    ])
    writeClaudeSession('/p/alpha', 'b', [
      { type: 'user', timestamp: '2026-05-15T10:00:00Z', message: { role: 'user', content: 'newer' } }
    ])

    const { getAgentSessions } = await loadService()
    const out = await getAgentSessions(['/p/alpha'], null)
    expect(out.map((s) => s.title)).toEqual(['newer', 'older'])
  })
})
