import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

import { claudeProjectsDir, claudeProjectSlug } from '@main/services/claude-paths'

const execFile = promisify(execFileCb)

export type SessionAgent = 'claude' | 'codex'

export interface AgentSession {
  id: string
  agent: SessionAgent
  projectPath: string
  title: string
  start: number
  end: number
  userTurns: number
}

const CLAUDE_TITLE_MAX = 160

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, CLAUDE_TITLE_MAX)
}

async function readClaudeSession(
  filePath: string,
  projectPath: string,
  sinceMs: number | null
): Promise<AgentSession | null> {
  const id = path.basename(filePath).replace(/\.jsonl$/, '')
  let aiTitle = ''
  let firstUserMessage = ''
  let start: number | null = null
  let end: number | null = null
  let userTurns = 0

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  try {
    for await (const line of rl) {
      if (!line) continue
      let row: Record<string, unknown>
      try {
        row = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }

      const ts = parseTimestamp(row.timestamp)
      if (ts !== null) {
        if (start === null || ts < start) start = ts
        if (end === null || ts > end) end = ts
      }

      if (row.type === 'ai-title' && typeof row.aiTitle === 'string') {
        aiTitle = row.aiTitle
        continue
      }

      if (row.type !== 'user') continue
      const msg = row.message as { role?: string; content?: unknown } | undefined
      if (!msg || msg.role !== 'user') continue
      if (typeof msg.content !== 'string') continue
      userTurns++
      if (!firstUserMessage) firstUserMessage = msg.content
    }
  } finally {
    rl.close()
    stream.close()
  }

  if (userTurns === 0) return null
  if (start === null || end === null) return null
  if (sinceMs !== null && end < sinceMs) return null

  const title = tidy(aiTitle || firstUserMessage)
  if (!title) return null

  return { id, agent: 'claude', projectPath, title, start, end, userTurns }
}

async function listClaudeSessions(
  projectPaths: string[],
  sinceMs: number | null
): Promise<AgentSession[]> {
  const root = claudeProjectsDir()
  const bySlug = new Map<string, string>()
  for (const p of projectPaths) bySlug.set(claudeProjectSlug(p), p)

  const out: AgentSession[] = []

  const entries: Array<[string, string]> = []
  bySlug.forEach((projectPath, slug) => entries.push([slug, projectPath]))

  for (const [slug, projectPath] of entries) {
    const dir = path.join(root, slug)
    let names: string[]
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }

    const candidates = names
      .filter((n) => n.endsWith('.jsonl'))
      .map((n) => path.join(dir, n))
      .filter((full) => {
        if (sinceMs === null) return true
        try {
          return fs.statSync(full).mtimeMs >= sinceMs
        } catch {
          return false
        }
      })

    const sessions = await Promise.all(
      candidates.map((full) =>
        readClaudeSession(full, projectPath, sinceMs).catch(() => null)
      )
    )
    for (const s of sessions) if (s) out.push(s)
  }

  return out
}

function codexDbPath(): string | null {
  const dir = path.join(os.homedir(), '.codex')
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return null
  }
  const candidates = names
    .filter((n) => /^state_\d+\.sqlite$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10)
      const nb = parseInt(b.replace(/\D/g, ''), 10)
      return nb - na
    })
  if (candidates.length === 0) return null
  return path.join(dir, candidates[0])
}

async function listCodexSessions(
  projectPaths: string[],
  sinceMs: number | null
): Promise<AgentSession[]> {
  const db = codexDbPath()
  if (!db) return []

  const known = new Set(projectPaths.map((p) => path.resolve(p)))
  const since = sinceMs ?? 0
  const sql =
    'SELECT id, cwd, ' +
    "COALESCE(NULLIF(title, ''), NULLIF(name, ''), NULLIF(first_user_message, ''), preview) AS label, " +
    'COALESCE(created_at_ms, created_at * 1000) AS started, ' +
    'COALESCE(updated_at_ms, updated_at * 1000) AS ended ' +
    `FROM threads WHERE archived = 0 AND COALESCE(updated_at_ms, updated_at * 1000) >= ${since} ` +
    'ORDER BY ended DESC LIMIT 2000;'

  let stdout: string
  try {
    const res = await execFile('sqlite3', ['-readonly', '-json', db, sql], {
      timeout: 10000,
      maxBuffer: 16 * 1024 * 1024
    })
    stdout = res.stdout.trim()
  } catch {
    return []
  }
  if (!stdout) return []

  let rows: Array<{
    id?: string
    cwd?: string
    label?: string
    started?: number
    ended?: number
  }>
  try {
    rows = JSON.parse(stdout)
  } catch {
    return []
  }

  const out: AgentSession[] = []
  for (const row of rows) {
    if (!row.id || !row.cwd) continue
    const resolved = path.resolve(row.cwd)
    if (!known.has(resolved)) continue
    const title = tidy(row.label ?? '')
    if (!title) continue
    const start = typeof row.started === 'number' ? row.started : 0
    const end = typeof row.ended === 'number' ? row.ended : start
    if (!start) continue
    out.push({
      id: row.id,
      agent: 'codex',
      projectPath: resolved,
      title,
      start,
      end,
      userTurns: 0
    })
  }
  return out
}

export async function getAgentSessions(
  projectPaths: string[],
  sinceIso: string | null
): Promise<AgentSession[]> {
  const sinceMs = sinceIso ? Date.parse(sinceIso) : null
  const since = sinceMs !== null && !Number.isNaN(sinceMs) ? sinceMs : null

  const [claude, codex] = await Promise.all([
    listClaudeSessions(projectPaths, since).catch(() => [] as AgentSession[]),
    listCodexSessions(projectPaths, since).catch(() => [] as AgentSession[])
  ])

  return [...claude, ...codex].sort((a, b) => b.end - a.end)
}
