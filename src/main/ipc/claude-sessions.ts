import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { safeHandle } from '@main/ipc/safe-handle'

export interface ClaudeSessionSummary {
  id: string
  mtime: number
  turnCount: number
  firstUserMessage: string
  firstUserTimestamp: string | null
}

function projectSlug(projectPath: string): string {
  return path.resolve(projectPath).replace(/\//g, '-')
}

function sessionsDirFor(projectPath: string): string {
  return path.join(os.homedir(), '.claude', 'projects', projectSlug(projectPath))
}

async function summarize(filePath: string): Promise<{
  turnCount: number
  firstUserMessage: string
  firstUserTimestamp: string | null
}> {
  let turnCount = 0
  let firstUserMessage = ''
  let firstUserTimestamp: string | null = null

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
      if (row.type !== 'user') continue
      const msg = row.message as { role?: string; content?: unknown } | undefined
      if (!msg || msg.role !== 'user') continue
      const content = msg.content
      if (typeof content !== 'string') continue
      turnCount++
      if (!firstUserMessage) {
        firstUserMessage = content.trim().replace(/\s+/g, ' ').slice(0, 200)
        const ts = row.timestamp
        if (typeof ts === 'string') firstUserTimestamp = ts
      }
    }
  } finally {
    rl.close()
    stream.close()
  }

  return { turnCount, firstUserMessage, firstUserTimestamp }
}

async function listSessions(projectPath: string): Promise<ClaudeSessionSummary[]> {
  const dir = sessionsDirFor(projectPath)
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }

  const jsonlFiles = names.filter((n) => n.endsWith('.jsonl'))

  const summaries = await Promise.all(
    jsonlFiles.map(async (name): Promise<ClaudeSessionSummary | null> => {
      const full = path.join(dir, name)
      let stat: fs.Stats
      try {
        stat = fs.statSync(full)
      } catch {
        return null
      }
      if (!stat.isFile()) return null
      const id = name.replace(/\.jsonl$/, '')
      try {
        const { turnCount, firstUserMessage, firstUserTimestamp } = await summarize(full)
        if (turnCount === 0) return null
        return {
          id,
          mtime: stat.mtimeMs,
          turnCount,
          firstUserMessage,
          firstUserTimestamp
        }
      } catch {
        return null
      }
    })
  )

  return summaries
    .filter((s): s is ClaudeSessionSummary => s !== null)
    .sort((a, b) => b.mtime - a.mtime)
}

export function registerClaudeSessionsHandlers(): void {
  safeHandle(
    'claude-sessions:list',
    (_event, projectPath: string): Promise<ClaudeSessionSummary[]> => {
      return listSessions(projectPath)
    }
  )
}
