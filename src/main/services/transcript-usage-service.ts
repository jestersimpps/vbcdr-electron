import fs from 'fs'
import os from 'os'
import path from 'path'

export interface TranscriptUsage {
  contextTokens: number
  model: string | null
  contextCap: number
}

const DEFAULT_CAP = 200_000

function projectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

function slugifyCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function contextCapForModel(model: string | null): number {
  if (!model) return DEFAULT_CAP
  const m = model.toLowerCase()
  if (m.includes('1m') || m.includes('[1m]')) return 1_000_000
  if (m.includes('haiku')) return 200_000
  if (m.includes('sonnet') || m.includes('opus') || m.includes('fable')) return 200_000
  return DEFAULT_CAP
}

interface UsageBlock {
  input_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

function contextFromUsage(usage: UsageBlock | undefined): number | null {
  if (!usage) return null
  const input = usage.input_tokens ?? 0
  const cacheCreate = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const total = input + cacheCreate + cacheRead
  return total > 0 ? total : null
}

function newestTranscript(dir: string): string | null {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  let newestPath: string | null = null
  let newestMtime = -Infinity
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.jsonl')) continue
    const full = path.join(dir, ent.name)
    try {
      const mtime = fs.statSync(full).mtimeMs
      if (mtime > newestMtime) {
        newestMtime = mtime
        newestPath = full
      }
    } catch {
      /* skip unreadable */
    }
  }
  return newestPath
}

const TAIL_BYTES = 256 * 1024

function readTail(file: string): string {
  try {
    const { size } = fs.statSync(file)
    const start = Math.max(0, size - TAIL_BYTES)
    const fd = fs.openSync(file, 'r')
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

export function readTranscriptUsage(cwd: string): TranscriptUsage | null {
  if (!cwd) return null
  const dir = path.join(projectsDir(), slugifyCwd(cwd))
  const file = newestTranscript(dir)
  if (!file) return null

  const tail = readTail(file)
  if (!tail) return null

  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line || !line.includes('"assistant"')) continue
    let entry: { message?: { model?: string; usage?: UsageBlock } }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const msg = entry.message
    if (!msg) continue
    const context = contextFromUsage(msg.usage)
    if (context === null) continue
    const model = msg.model ?? null
    let contextCap = contextCapForModel(model)
    if (context > contextCap) contextCap = 1_000_000
    return { contextTokens: context, model, contextCap }
  }
  return null
}
