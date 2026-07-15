import fs from 'fs'
import os from 'os'
import path from 'path'

export interface TranscriptUsage {
  contextTokens: number
  model: string | null
  contextCap: number
}

const DEFAULT_CAP = 200_000
const MAX_CANDIDATE_FILES = 5
const BIRTH_SLACK_MS = 15_000
const CAP_FLOOR_MAX_ENTRIES = 200

function projectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

function slugifyCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function contextCapForModel(model: string | null): number {
  if (!model) return DEFAULT_CAP
  if (model.toLowerCase().includes('1m')) return 1_000_000
  return DEFAULT_CAP
}

interface UsageBlock {
  input_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface TranscriptEntry {
  isSidechain?: boolean
  message?: { model?: string; usage?: UsageBlock }
}

function contextFromUsage(usage: UsageBlock | undefined): number | null {
  if (!usage) return null
  const input = usage.input_tokens ?? 0
  const cacheCreate = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const total = input + cacheCreate + cacheRead
  return total > 0 ? total : null
}

interface TranscriptFile {
  path: string
  mtimeMs: number
  birthtimeMs: number
}

function listTranscripts(dir: string): TranscriptFile[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: TranscriptFile[] = []
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.jsonl')) continue
    const full = path.join(dir, ent.name)
    try {
      const stat = fs.statSync(full)
      files.push({ path: full, mtimeMs: stat.mtimeMs, birthtimeMs: stat.birthtimeMs })
    } catch {
      /* skip unreadable */
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
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

export function findUsageInTail(tail: string): { contextTokens: number; model: string | null } | null {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line || !line.includes('"assistant"')) continue
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.isSidechain === true) continue
    const msg = entry.message
    if (!msg) continue
    const contextTokens = contextFromUsage(msg.usage)
    if (contextTokens === null) continue
    return { contextTokens, model: msg.model ?? null }
  }
  return null
}

const capFloorByFile = new Map<string, number>()

function resolveContextCap(file: string, model: string | null, contextTokens: number): number {
  let cap = contextCapForModel(model)
  const floor = capFloorByFile.get(file)
  if (floor !== undefined && floor > cap) cap = floor
  if (contextTokens > cap) {
    cap = 1_000_000
    if (capFloorByFile.size >= CAP_FLOOR_MAX_ENTRIES) capFloorByFile.clear()
    capFloorByFile.set(file, cap)
  }
  return cap
}

export function readTranscriptUsage(cwd: string, sessionStartMs?: number | null): TranscriptUsage | null {
  if (!cwd) return null
  const dir = path.join(projectsDir(), slugifyCwd(cwd))
  const files = listTranscripts(dir)
  if (files.length === 0) return null

  const passes: TranscriptFile[][] = []
  if (sessionStartMs != null) {
    const ownFiles = files.filter((f) => f.birthtimeMs >= sessionStartMs - BIRTH_SLACK_MS)
    if (ownFiles.length > 0) passes.push(ownFiles)
  }
  passes.push(files)

  const scanned = new Set<string>()
  for (const pass of passes) {
    for (const file of pass.slice(0, MAX_CANDIDATE_FILES)) {
      if (scanned.has(file.path)) continue
      scanned.add(file.path)
      const tail = readTail(file.path)
      if (!tail) continue
      const usage = findUsageInTail(tail)
      if (!usage) continue
      return {
        contextTokens: usage.contextTokens,
        model: usage.model,
        contextCap: resolveContextCap(file.path, usage.model, usage.contextTokens)
      }
    }
  }
  return null
}
