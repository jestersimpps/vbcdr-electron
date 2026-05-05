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
  cpu: number | null
  memoryMB: number | null
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

interface PsStats {
  command: string | null
  startedAt: number | null
  cpu: number | null
  memoryMB: number | null
}

async function getPsStats(pid: number): Promise<PsStats> {
  try {
    const { stdout } = await execFileAsync(
      'ps',
      ['-p', String(pid), '-o', 'pcpu=,rss=,lstart=,command='],
      { timeout: 1000 }
    )
    const line = stdout.trim()
    if (!line) return { command: null, startedAt: null, cpu: null, memoryMB: null }
    // pcpu rss lstart(5 tokens: "Tue May  5 12:34:56 2026") command(rest)
    const parts = line.split(/\s+/)
    if (parts.length < 8) return { command: null, startedAt: null, cpu: null, memoryMB: null }
    const cpu = parseFloat(parts[0])
    const rssKB = parseInt(parts[1], 10)
    const lstart = parts.slice(2, 7).join(' ')
    const command = parts.slice(7).join(' ')
    const ts = Date.parse(lstart)
    return {
      command: command || null,
      startedAt: Number.isNaN(ts) ? null : ts,
      cpu: Number.isNaN(cpu) ? null : cpu,
      memoryMB: Number.isNaN(rssKB) ? null : Math.round(rssKB / 1024)
    }
  } catch {
    return { command: null, startedAt: null, cpu: null, memoryMB: null }
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
  if (os.platform() === 'win32') {
    return listDevServersWindows()
  }
  return listDevServersUnix()
}

async function listDevServersUnix(): Promise<DevServer[]> {
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
      const [cwd, stats] = await Promise.all([getCwd(row.pid), getPsStats(row.pid)])
      return {
        pid: row.pid,
        port: row.port,
        process: row.process,
        user: row.user,
        cwd,
        command: stats.command ?? row.process,
        startedAt: stats.startedAt,
        cpu: stats.cpu,
        memoryMB: stats.memoryMB
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

const WIN_SYSTEM_PROCESS_BLOCKLIST = new Set([
  'System',
  'Idle',
  'svchost',
  'lsass',
  'services',
  'wininit',
  'csrss',
  'smss',
  'spoolsv',
  'WUDFHost',
  'RuntimeBroker'
])

interface WindowsRawRow {
  Pid: number
  Port: number
  Name: string | null
  Path: string | null
  CPU: number | null
  WorkingSetMB: number | null
  StartTime: string | null
  CommandLine: string | null
  UserName: string | null
}

async function listDevServersWindows(): Promise<DevServer[]> {
  // One PowerShell call: list listening TCP ports, join with process info.
  // Output is a JSON array; if anything fails we return [] and the UI shows the empty state.
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $conns = Get-NetTCPConnection -State Listen -ErrorAction Stop |
    Select-Object OwningProcess, LocalPort -Unique
  $procs = @{}
  Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $procs[$_.Id] = $_ }
  $rows = foreach ($c in $conns) {
    $p = $procs[[int]$c.OwningProcess]
    if ($null -eq $p) { continue }
    $cmd = $null
    try {
      $ci = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction Stop
      $cmd = $ci.CommandLine
    } catch {}
    [PSCustomObject]@{
      Pid          = $p.Id
      Port         = [int]$c.LocalPort
      Name         = $p.ProcessName
      Path         = $p.Path
      CPU          = $p.CPU
      WorkingSetMB = [math]::Round($p.WorkingSet64 / 1MB)
      StartTime    = if ($p.StartTime) { $p.StartTime.ToString('o') } else { $null }
      CommandLine  = $cmd
      UserName     = $env:USERNAME
    }
  }
  $rows | ConvertTo-Json -Compress -Depth 3
} catch {
  '[]'
}
`.trim()

  let stdout: string
  try {
    const result = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 8000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }
    )
    stdout = result.stdout
  } catch {
    return []
  }

  const trimmed = stdout.trim()
  if (!trimmed) return []

  let parsed: WindowsRawRow[] | WindowsRawRow
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const seen = new Set<string>()
  const servers: DevServer[] = []
  for (const r of rows) {
    if (!r || typeof r.Pid !== 'number' || typeof r.Port !== 'number') continue
    const key = `${r.Pid}:${r.Port}`
    if (seen.has(key)) continue
    seen.add(key)
    if (r.Name && WIN_SYSTEM_PROCESS_BLOCKLIST.has(r.Name)) continue
    const startedAt = r.StartTime ? Date.parse(r.StartTime) : NaN
    servers.push({
      pid: r.Pid,
      port: r.Port,
      process: r.Name ?? 'unknown',
      user: r.UserName ?? '',
      cwd: r.Path ? path.dirname(r.Path) : null,
      command: r.CommandLine ?? r.Path ?? r.Name ?? 'unknown',
      startedAt: Number.isNaN(startedAt) ? null : startedAt,
      cpu: typeof r.CPU === 'number' ? r.CPU : null,
      memoryMB: typeof r.WorkingSetMB === 'number' ? r.WorkingSetMB : null
    })
  }

  servers.sort((a, b) => {
    const aLikely = isLikelyDevServer(a)
    const bLikely = isLikelyDevServer(b)
    if (aLikely !== bLikely) return aLikely ? -1 : 1
    return a.port - b.port
  })

  return servers
}

export function isLikelyDevServer(server: DevServer): boolean {
  if (!server.cwd) return false
  const home = os.homedir()
  const cwdNorm = server.cwd.toLowerCase()
  const homeNorm = home.toLowerCase()
  if (!cwdNorm.startsWith(homeNorm)) return false
  if (os.platform() === 'win32') {
    // Skip system-y locations under the user profile on Windows
    const skip = ['\\appdata\\', '\\onedrive\\']
    if (skip.some((s) => cwdNorm.includes(s))) return false
    return true
  }
  const insideLibrary = cwdNorm.startsWith(path.join(home, 'Library').toLowerCase())
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
