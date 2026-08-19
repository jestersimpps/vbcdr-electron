import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { findUsageInTail, findModelInHead, readCodexUsage } from './codex-usage-service'

function tokenCountLine(opts: {
  total?: number
  input?: number
  output?: number
  window?: number | null
  info?: null
}): string {
  const payload: Record<string, unknown> = { type: 'token_count', rate_limits: null }
  if (opts.info === null) {
    payload.info = null
  } else {
    const usage: Record<string, number> = {}
    if (opts.total !== undefined) usage.total_tokens = opts.total
    if (opts.input !== undefined) usage.input_tokens = opts.input
    if (opts.output !== undefined) usage.output_tokens = opts.output
    payload.info = {
      total_token_usage: usage,
      last_token_usage: usage,
      model_context_window: opts.window === undefined ? 258400 : opts.window
    }
  }
  return JSON.stringify({ timestamp: '2026-08-19T10:00:00.000Z', type: 'event_msg', payload })
}

function sessionMetaLine(cwd: string, model = 'gpt-5-codex'): string {
  return JSON.stringify({
    timestamp: '2026-08-19T09:59:00.000Z',
    type: 'session_meta',
    payload: { id: 'abc', cwd, model, cli_version: '0.148.0' }
  })
}

describe('findUsageInTail', () => {
  it('reads total_tokens and the model context window', () => {
    const tail = [tokenCountLine({ total: 34118, window: 258400 })].join('\n')
    expect(findUsageInTail(tail)).toEqual({ contextTokens: 34118, contextCap: 258400 })
  })

  it('skips rate-limit-only lines where info is null', () => {
    const tail = [
      tokenCountLine({ total: 5000 }),
      tokenCountLine({ info: null }),
      tokenCountLine({ info: null })
    ].join('\n')
    expect(findUsageInTail(tail)?.contextTokens).toBe(5000)
  })

  it('takes the last cumulative total rather than summing', () => {
    const tail = [
      tokenCountLine({ total: 1000 }),
      tokenCountLine({ total: 2500 }),
      tokenCountLine({ total: 4000 })
    ].join('\n')
    expect(findUsageInTail(tail)?.contextTokens).toBe(4000)
  })

  it('falls back to input+output when total_tokens is absent', () => {
    const tail = tokenCountLine({ input: 1200, output: 300 })
    expect(findUsageInTail(tail)?.contextTokens).toBe(1500)
  })

  it('returns null cap when model_context_window is missing', () => {
    const tail = tokenCountLine({ total: 10, window: null })
    expect(findUsageInTail(tail)?.contextCap).toBeNull()
  })

  it('ignores malformed and unrelated lines', () => {
    const tail = ['not json', '{"type":"event_msg"}', tokenCountLine({ total: 77 })].join('\n')
    expect(findUsageInTail(tail)?.contextTokens).toBe(77)
  })

  it('returns null when there is no usable token_count', () => {
    expect(findUsageInTail(tokenCountLine({ info: null }))).toBeNull()
    expect(findUsageInTail('')).toBeNull()
  })
})

describe('findModelInHead', () => {
  it('reads the model from session_meta', () => {
    expect(findModelInHead(sessionMetaLine('/tmp/x', 'gpt-5-codex'))).toBe('gpt-5-codex')
  })

  it('returns null when absent', () => {
    expect(findModelInHead('')).toBeNull()
  })
})

describe('readCodexUsage', () => {
  let home = ''

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'))
    process.env.CODEX_HOME = home
  })

  afterEach(() => {
    delete process.env.CODEX_HOME
    fs.rmSync(home, { recursive: true, force: true })
  })

  const writeRollout = (name: string, lines: string[]): void => {
    const dir = path.join(home, 'sessions', '2026', '08', '19')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n', 'utf-8')
  }

  it('returns usage for a matching cwd', () => {
    writeRollout('rollout-2026-08-19T10-00-00-abc.jsonl', [
      sessionMetaLine('/Users/x/proj'),
      tokenCountLine({ total: 12345, window: 258400 })
    ])
    expect(readCodexUsage('/Users/x/proj')).toEqual({
      contextTokens: 12345,
      model: 'gpt-5-codex',
      contextCap: 258400
    })
  })

  it('ignores sessions from a different cwd', () => {
    writeRollout('rollout-2026-08-19T10-00-00-abc.jsonl', [
      sessionMetaLine('/Users/x/other'),
      tokenCountLine({ total: 999 })
    ])
    expect(readCodexUsage('/Users/x/proj')).toBeNull()
  })

  it('returns null when no rollouts exist', () => {
    expect(readCodexUsage('/Users/x/proj')).toBeNull()
  })

  it('returns null for an empty cwd', () => {
    expect(readCodexUsage('')).toBeNull()
  })
})
