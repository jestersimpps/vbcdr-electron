import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'

const execFileAsync = promisify(execFile)

export interface DevServer {
  pid: number
  port: number
  command: string
  process: string
  cwd: string | null
  user: string
  startedAt: number | null
}

interface ListenRow {
  pid: number
  process: string
  user: string
  port: number
}

function parseLsofListen(output: string): ListenRow[] {
  const rows: ListenRow[] = []
  const seen = new Set<string>()
  const lines = output.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    const proc = parts[0]
    const pid = parseInt(parts[1], 10)
    const user = parts[2]
    const name = parts.slice(8).join(' ')
    if (Number.isNaN(pid)) continue
    const portMatch = name.match(/:(\d+)\s*\(LISTEN\)/)
    if (!portMatch) continue
    const port = parseInt(portMatch[1], 10)
    const key = `${pid}:${port}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ pid, process: proc, user, port })
  }
  return rows
}

async function getCwd(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-p', String(pid), '-d', 'cwd', '-Fn', '-a'], {
      timeout: 1500
    })
    for (const line of stdout.split('\n')) {
      if (line.startsWith('n')) {
        const value = line.slice(1)
        if (value && value !== '/') return value
      }
    }
  } catch {
    // pid gone or denied
  }
  return null
}

async function getCommand(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command='], {
      timeout: 1000
    })
    const trimmed = stdout.trim()
    return trimmed || null
  } catch {
    return null
  }
}

async function getStartedAt(pid: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'lstart='], {
      timeout: 1000
    })
    const ts = Date.parse(stdout.trim())
    return Number.isNaN(ts) ? null : ts
  } catch {
    return null
  }
}

const SYSTEM_PROCESS_BLOCKLIST = new Set([
  'rapportd',
  'ControlCe',
  'ControlCenter',
  'launchd',
  'cupsd',
  'mDNSRespo',
  'mDNSResponder',
  'sharingd',
  'remoted',
  'rpc.statd',
  'rpcbind',
  'sshd',
  'WindowServer'
])

export async function listDevServers(): Promise<DevServer[]> {
  if (os.platform() === 'win32') return []

  let output: string
  try {
    const result = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-nP'], {
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024
    })
    output = result.stdout
  } catch (err) {
    const e = err as { stdout?: string; code?: number }
    if (e.stdout) {
      output = e.stdout
    } else {
      return []
    }
  }

  const rows = parseLsofListen(output).filter(
    (r) => !SYSTEM_PROCESS_BLOCKLIST.has(r.process)
  )

  const enriched = await Promise.all(
    rows.map(async (row): Promise<DevServer> => {
      const [cwd, command, startedAt] = await Promise.all([
        getCwd(row.pid),
        getCommand(row.pid),
        getStartedAt(row.pid)
      ])
      return {
        pid: row.pid,
        port: row.port,
        process: row.process,
        user: row.user,
        cwd,
        command: command ?? row.process,
        startedAt
      }
    })
  )

  enriched.sort((a, b) => {
    const aLikely = isLikelyDevServer(a)
    const bLikely = isLikelyDevServer(b)
    if (aLikely !== bLikely) return aLikely ? -1 : 1
    return a.port - b.port
  })

  return enriched
}

export function isLikelyDevServer(server: DevServer): boolean {
  if (!server.cwd) return false
  const home = os.homedir()
  if (!server.cwd.startsWith(home)) return false
  const insideLibrary = server.cwd.startsWith(path.join(home, 'Library'))
  if (insideLibrary) return false
  return true
}

export function killDevServer(pid: number, force = false): boolean {
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
    return true
  } catch {
    return false
  }
}
