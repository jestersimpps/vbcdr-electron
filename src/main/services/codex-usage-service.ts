import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

export interface CodexUsage {
  contextTokens: number
  model: string | null
  contextCap: number
}

const DEFAULT_CAP = 272_000
const MAX_CANDIDATE_FILES = 5
const TAIL_BYTES = 256 * 1024
const BIRTH_SLACK_MS = 15_000

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

interface RolloutFile {
  path: string
  mtimeMs: number
  birthtimeMs: number
  compressed: boolean
}

function collectRollouts(root: string): RolloutFile[] {
  const files: RolloutFile[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!ent.isFile() || !ent.name.startsWith('rollout-')) continue
      if (!ent.name.includes('.jsonl')) continue
      try {
        const stat = fs.statSync(full)
        files.push({
          path: full,
          mtimeMs: stat.mtimeMs,
          birthtimeMs: stat.birthtimeMs,
          compressed: ent.name.endsWith('.zst')
        })
      } catch {
        /* skip unreadable */
      }
    }
  }
  walk(path.join(root, 'sessions'), 0)
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
}

function readTail(file: RolloutFile): string {
  if (file.compressed) {
    try {
      return execFileSync('zstd', ['-dc', file.path], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 10_000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
    } catch {
      return ''
    }
  }
  try {
    const { size } = fs.statSync(file.path)
    const start = Math.max(0, size - TAIL_BYTES)
    const fd = fs.openSync(file.path, 'r')
    try {
      const len = size - start
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, start)
      return buf.toString('utf-8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

interface TokenUsageBlock {
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
}

interface RolloutLine {
  type?: string
  payload?: {
    type?: string
    info?: {
      total_token_usage?: TokenUsageBlock
      model_context_window?: number | null
    } | null
    model?: string
  }
}

function totalFrom(usage: TokenUsageBlock | undefined): number | null {
  if (!usage) return null
  if (typeof usage.total_tokens === 'number' && usage.total_tokens > 0) {
    return usage.total_tokens
  }
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const sum = input + output
  return sum > 0 ? sum : null
}

export function findUsageInTail(tail: string): {
  contextTokens: number
  contextCap: number | null
} | null {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line || !line.includes('token_count')) continue
    let entry: RolloutLine
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const payload = entry.payload
    if (!payload || payload.type !== 'token_count') continue
    const info = payload.info
    if (!info) continue
    const contextTokens = totalFrom(info.total_token_usage)
    if (contextTokens === null) continue
    const window = info.model_context_window
    return {
      contextTokens,
      contextCap: typeof window === 'number' && window > 0 ? window : null
    }
  }
  return null
}

export function findModelInHead(head: string): string | null {
  const lines = head.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || !line.includes('session_meta')) continue
    try {
      const entry = JSON.parse(line) as { payload?: { model?: string } }
      const model = entry.payload?.model
      if (typeof model === 'string' && model) return model
    } catch {
      continue
    }
  }
  return null
}

function cwdOf(tail: string): string | null {
  for (const raw of tail.split('\n')) {
    const line = raw.trim()
    if (!line || !line.includes('session_meta')) continue
    try {
      const entry = JSON.parse(line) as { payload?: { cwd?: string } }
      const cwd = entry.payload?.cwd
      if (typeof cwd === 'string' && cwd) return cwd
    } catch {
      continue
    }
  }
  return null
}

function readHead(file: RolloutFile): string {
  if (file.compressed) return readTail(file).slice(0, TAIL_BYTES)
  try {
    const fd = fs.openSync(file.path, 'r')
    try {
      const buf = Buffer.alloc(TAIL_BYTES)
      const read = fs.readSync(fd, buf, 0, TAIL_BYTES, 0)
      return buf.subarray(0, read).toString('utf-8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

export function readCodexUsage(cwd: string, sessionStartMs?: number | null): CodexUsage | null {
  if (!cwd) return null
  const files = collectRollouts(codexHome())
  if (files.length === 0) return null

  const target = path.resolve(cwd)
  const passes: RolloutFile[][] = []
  if (sessionStartMs != null) {
    const own = files.filter((f) => f.birthtimeMs >= sessionStartMs - BIRTH_SLACK_MS)
    if (own.length > 0) passes.push(own)
  }
  passes.push(files)

  const scanned = new Set<string>()
  for (const pass of passes) {
    let checked = 0
    for (const file of pass) {
      if (scanned.has(file.path)) continue
      if (checked >= MAX_CANDIDATE_FILES) break
      scanned.add(file.path)
      checked++
      const head = readHead(file)
      const sessionCwd = cwdOf(head)
      if (sessionCwd && path.resolve(sessionCwd) !== target) continue
      const tail = readTail(file)
      if (!tail) continue
      const usage = findUsageInTail(tail)
      if (!usage) continue
      return {
        contextTokens: usage.contextTokens,
        model: findModelInHead(head),
        contextCap: usage.contextCap ?? DEFAULT_CAP
      }
    }
  }
  return null
}
