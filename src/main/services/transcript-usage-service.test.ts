import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { contextCapForModel, findUsageInTail, readTranscriptUsage } from './transcript-usage-service'

const state = vi.hoisted(() => ({ home: '' }))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  const homedir = (): string => state.home
  return { ...actual, homedir, default: { ...actual, homedir } }
})

describe('contextCapForModel', () => {
  it('maps opus/sonnet/haiku to 200k', () => {
    expect(contextCapForModel('claude-opus-4-8')).toBe(200_000)
    expect(contextCapForModel('claude-sonnet-4-6')).toBe(200_000)
    expect(contextCapForModel('claude-haiku-4-5-20251001')).toBe(200_000)
  })

  it('maps the [1m] variant to 1M', () => {
    expect(contextCapForModel('claude-opus-4-8[1m]')).toBe(1_000_000)
  })

  it('defaults to 200k for unknown / null', () => {
    expect(contextCapForModel(null)).toBe(200_000)
    expect(contextCapForModel('some-other-model')).toBe(200_000)
  })
})

function assistantLine(opts: {
  input?: number
  cacheCreate?: number
  cacheRead?: number
  model?: string
  isSidechain?: boolean
}): string {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: opts.isSidechain ?? false,
    message: {
      role: 'assistant',
      model: opts.model ?? 'claude-sonnet-4-6',
      usage: {
        input_tokens: opts.input ?? 0,
        cache_creation_input_tokens: opts.cacheCreate ?? 0,
        cache_read_input_tokens: opts.cacheRead ?? 0
      }
    }
  })
}

describe('findUsageInTail', () => {
  it('sums input + cache creation + cache read of the last assistant entry', () => {
    const tail = [
      assistantLine({ input: 10, cacheCreate: 100, cacheRead: 1000 }),
      assistantLine({ input: 20, cacheCreate: 200, cacheRead: 2000 })
    ].join('\n')
    expect(findUsageInTail(tail)).toEqual({ contextTokens: 2220, model: 'claude-sonnet-4-6' })
  })

  it('skips sidechain entries so subagents do not hijack the count', () => {
    const tail = [
      assistantLine({ input: 5, cacheRead: 50_000, model: 'claude-opus-4-8' }),
      assistantLine({ input: 3, cacheRead: 900, isSidechain: true }),
      assistantLine({ input: 3, cacheRead: 1200, isSidechain: true })
    ].join('\n')
    expect(findUsageInTail(tail)).toEqual({ contextTokens: 50_005, model: 'claude-opus-4-8' })
  })

  it('returns null when only sidechain entries have usage', () => {
    const tail = assistantLine({ input: 3, cacheRead: 900, isSidechain: true })
    expect(findUsageInTail(tail)).toBeNull()
  })

  it('skips zero-usage entries and malformed lines', () => {
    const tail = [
      assistantLine({ input: 42 }),
      '{"type":"assistant","message":{"role":"assistant"',
      assistantLine({})
    ].join('\n')
    expect(findUsageInTail(tail)).toEqual({ contextTokens: 42, model: 'claude-sonnet-4-6' })
  })

  it('ignores non-assistant lines mentioning assistant in content', () => {
    const tail = JSON.stringify({ type: 'user', message: { content: 'the "assistant" said hi' } })
    expect(findUsageInTail(tail)).toBeNull()
  })
})

describe('readTranscriptUsage', () => {
  const cwd = '/my/proj'
  let transcriptsDir = ''

  const writeTranscript = (name: string, ...lines: string[]): string => {
    const file = path.join(transcriptsDir, name)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    return file
  }

  const bumpMtime = (file: string, offsetMs: number): void => {
    const t = (Date.now() + offsetMs) / 1000
    fs.utimesSync(file, t, t)
  }

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  beforeEach(async () => {
    const os = await vi.importActual<typeof import('os')>('os')
    state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-home-'))
    transcriptsDir = path.join(state.home, '.claude', 'projects', '-my-proj')
    fs.mkdirSync(transcriptsDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(state.home, { recursive: true, force: true })
  })

  it('returns null for an empty cwd or when no transcripts exist', () => {
    expect(readTranscriptUsage('')).toBeNull()
    expect(readTranscriptUsage(cwd)).toBeNull()
  })

  it('reads usage from the most recently modified transcript', () => {
    const older = writeTranscript('older.jsonl', assistantLine({ input: 100 }))
    bumpMtime(older, -60_000)
    writeTranscript('newer.jsonl', assistantLine({ input: 55, model: 'claude-opus-4-8' }))

    expect(readTranscriptUsage(cwd)).toEqual({
      contextTokens: 55,
      model: 'claude-opus-4-8',
      contextCap: 200_000
    })
  })

  it('falls back to an older transcript when the newest has no usable usage', () => {
    const older = writeTranscript('older.jsonl', assistantLine({ input: 77 }))
    bumpMtime(older, -60_000)
    writeTranscript('newer.jsonl', JSON.stringify({ type: 'user', message: { content: 'hi' } }))

    expect(readTranscriptUsage(cwd)?.contextTokens).toBe(77)
  })

  it('prefers transcripts born after the session start over newer-mtime older ones', async () => {
    const preexisting = writeTranscript('preexisting.jsonl', assistantLine({ input: 111 }))
    await sleep(50)
    const own = writeTranscript('own.jsonl', assistantLine({ input: 222 }))
    bumpMtime(preexisting, 60_000)

    const preBirth = fs.statSync(preexisting).birthtimeMs
    const ownBirth = fs.statSync(own).birthtimeMs
    expect(ownBirth).toBeGreaterThan(preBirth)

    expect(readTranscriptUsage(cwd)?.contextTokens).toBe(111)
    expect(readTranscriptUsage(cwd, ownBirth + 15_000)?.contextTokens).toBe(222)
  })

  it('falls back to all transcripts when nothing was born after the session start', () => {
    writeTranscript('only.jsonl', assistantLine({ input: 42 }))
    expect(readTranscriptUsage(cwd, Date.now() + 120_000)?.contextTokens).toBe(42)
  })

  it('escalates the cap to 1M when usage exceeds it and keeps it as a floor per file', () => {
    const file = writeTranscript('big.jsonl', assistantLine({ cacheRead: 250_000 }))
    expect(readTranscriptUsage(cwd)?.contextCap).toBe(1_000_000)

    fs.writeFileSync(file, assistantLine({ cacheRead: 50_000 }) + '\n')
    expect(readTranscriptUsage(cwd)).toEqual({
      contextTokens: 50_000,
      model: 'claude-sonnet-4-6',
      contextCap: 1_000_000
    })
  })
})
