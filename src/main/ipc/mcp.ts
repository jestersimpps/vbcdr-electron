import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import * as pty from 'node-pty'
import type { McpHealth, McpScope, McpServerConfig, McpServerEntry, McpStatusEntry } from '@main/models/types'
import { safeHandle } from '@main/ipc/safe-handle'

const IS_WINDOWS = process.platform === 'win32'
const STATUS_TIMEOUT_MS = 60_000
const LOGIN_TIMEOUT_MS = 300_000

type JsonObject = Record<string, unknown>

function claudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json')
}

function projectMcpJsonPath(projectPath: string): string {
  return path.join(projectPath, '.mcp.json')
}

function readJsonFile(filePath: string): JsonObject {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as JsonObject) : {}
  } catch {
    return {}
  }
}

function writeJsonFileAtomic(filePath: string, data: JsonObject): void {
  const tmpPath = filePath + '.vbcdr-tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function serversFrom(obj: unknown): Record<string, McpServerConfig> {
  if (typeof obj !== 'object' || obj === null) return {}
  return obj as Record<string, McpServerConfig>
}

function projectEntry(claudeJson: JsonObject, projectPath: string): JsonObject {
  const projects = (claudeJson.projects ?? {}) as JsonObject
  return (projects[projectPath] ?? {}) as JsonObject
}

function listServers(projectPath: string | null): McpServerEntry[] {
  const entries: McpServerEntry[] = []
  const claudeJson = readJsonFile(claudeJsonPath())

  for (const [name, config] of Object.entries(serversFrom(claudeJson.mcpServers))) {
    entries.push({ name, scope: 'user', config, enabled: true })
  }

  if (projectPath) {
    const project = projectEntry(claudeJson, projectPath)
    for (const [name, config] of Object.entries(serversFrom(project.mcpServers))) {
      entries.push({ name, scope: 'local', config, enabled: true })
    }

    const disabled = new Set(
      Array.isArray(project.disabledMcpjsonServers) ? (project.disabledMcpjsonServers as string[]) : []
    )
    const mcpJson = readJsonFile(projectMcpJsonPath(projectPath))
    for (const [name, config] of Object.entries(serversFrom(mcpJson.mcpServers))) {
      entries.push({ name, scope: 'project', config, enabled: !disabled.has(name) })
    }
  }

  return entries
}

function mutateScope(
  scope: McpScope,
  projectPath: string | null,
  mutate: (servers: Record<string, McpServerConfig>) => void
): void {
  if (scope === 'project') {
    if (!projectPath) throw new Error('Project scope requires an active project')
    const filePath = projectMcpJsonPath(projectPath)
    const mcpJson = readJsonFile(filePath)
    const servers = serversFrom(mcpJson.mcpServers)
    mutate(servers)
    mcpJson.mcpServers = servers
    writeJsonFileAtomic(filePath, mcpJson)
    return
  }

  const filePath = claudeJsonPath()
  const claudeJson = readJsonFile(filePath)
  if (scope === 'user') {
    const servers = serversFrom(claudeJson.mcpServers)
    mutate(servers)
    claudeJson.mcpServers = servers
  } else {
    if (!projectPath) throw new Error('Local scope requires an active project')
    const projects = (claudeJson.projects ?? {}) as JsonObject
    const project = (projects[projectPath] ?? {}) as JsonObject
    const servers = serversFrom(project.mcpServers)
    mutate(servers)
    project.mcpServers = servers
    projects[projectPath] = project
    claudeJson.projects = projects
  }
  writeJsonFileAtomic(filePath, claudeJson)
}

function setProjectServerEnabled(projectPath: string, name: string, enabled: boolean): void {
  const filePath = claudeJsonPath()
  const claudeJson = readJsonFile(filePath)
  const projects = (claudeJson.projects ?? {}) as JsonObject
  const project = (projects[projectPath] ?? {}) as JsonObject
  const enabledList = new Set(
    Array.isArray(project.enabledMcpjsonServers) ? (project.enabledMcpjsonServers as string[]) : []
  )
  const disabledList = new Set(
    Array.isArray(project.disabledMcpjsonServers) ? (project.disabledMcpjsonServers as string[]) : []
  )
  if (enabled) {
    disabledList.delete(name)
    enabledList.add(name)
  } else {
    enabledList.delete(name)
    disabledList.add(name)
  }
  project.enabledMcpjsonServers = Array.from(enabledList)
  project.disabledMcpjsonServers = Array.from(disabledList)
  projects[projectPath] = project
  claudeJson.projects = projects
  writeJsonFileAtomic(filePath, claudeJson)
}

function parseHealth(text: string): McpHealth {
  if (/needs authentication/i.test(text)) return 'needs-auth'
  if (/connected/i.test(text)) return 'connected'
  return 'failed'
}

function parseStatusOutput(output: string): McpStatusEntry[] {
  const entries: McpStatusEntry[] = []
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim()
    const sepIndex = line.lastIndexOf(' - ')
    if (sepIndex === -1) continue
    const head = line.slice(0, sepIndex)
    const detail = line.slice(sepIndex + 3).replace(/^[✔✓✘✗!⚠]\s*/, '').trim()
    const nameEnd = head.indexOf(': ')
    if (nameEnd === -1) continue
    entries.push({
      name: head.slice(0, nameEnd),
      target: head.slice(nameEnd + 2),
      health: parseHealth(detail),
      detail
    })
  }
  return entries
}

function runClaudeMcpList(cwd: string): Promise<McpStatusEntry[]> {
  return new Promise((resolve, reject) => {
    const proc = IS_WINDOWS
      ? spawn('claude', ['mcp', 'list'], { cwd, shell: true })
      : spawn(process.env.SHELL || '/bin/zsh', ['-lc', 'claude mcp list'], { cwd })
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      proc.kill()
      resolve(parseStatusOutput(output))
    }, STATUS_TIMEOUT_MS)
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })
    proc.stderr.on('data', (data: Buffer) => {
      output += data.toString()
    })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Could not run claude CLI: ${err.message}`))
    })
    proc.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(parseStatusOutput(output))
    })
  })
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '')
}

function runClaudeMcpAuth(
  cwd: string,
  action: 'login' | 'logout',
  name: string
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    let proc: pty.IPty
    try {
      proc = IS_WINDOWS
        ? pty.spawn('cmd.exe', ['/c', 'claude', 'mcp', action, name], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd,
            env: { ...process.env } as Record<string, string>
          })
        : pty.spawn(process.env.SHELL || '/bin/zsh', ['-lc', `claude mcp ${action} "$0"`, name], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd,
            env: { ...process.env } as Record<string, string>
          })
    } catch (err) {
      reject(new Error(`Could not run claude CLI: ${err instanceof Error ? err.message : String(err)}`))
      return
    }
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      proc.kill()
      resolve({ code: -1, output: stripAnsi(output) + '\nTimed out waiting for authentication to complete.' })
    }, LOGIN_TIMEOUT_MS)
    proc.onData((data) => {
      output += data
    })
    proc.onExit(({ exitCode }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: exitCode, output: stripAnsi(output) })
    })
  })
}

export function registerMcpHandlers(): void {
  safeHandle('mcp:list', (_event, projectPath: string | null): McpServerEntry[] => {
    return listServers(projectPath)
  })

  safeHandle(
    'mcp:upsert',
    (_event, scope: McpScope, projectPath: string | null, name: string, config: McpServerConfig): void => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Server name is required')
      mutateScope(scope, projectPath, (servers) => {
        servers[trimmed] = config
      })
    }
  )

  safeHandle(
    'mcp:remove',
    (_event, scope: McpScope, projectPath: string | null, name: string): void => {
      mutateScope(scope, projectPath, (servers) => {
        delete servers[name]
      })
    }
  )

  safeHandle(
    'mcp:set-enabled',
    (_event, projectPath: string, name: string, enabled: boolean): void => {
      setProjectServerEnabled(projectPath, name, enabled)
    }
  )

  safeHandle('mcp:status', async (_event, projectPath: string | null): Promise<McpStatusEntry[]> => {
    return runClaudeMcpList(projectPath ?? os.homedir())
  })

  safeHandle(
    'mcp:login',
    async (_event, projectPath: string | null, name: string): Promise<{ code: number; output: string }> => {
      return runClaudeMcpAuth(projectPath ?? os.homedir(), 'login', name)
    }
  )

  safeHandle(
    'mcp:logout',
    async (_event, projectPath: string | null, name: string): Promise<{ code: number; output: string }> => {
      return runClaudeMcpAuth(projectPath ?? os.homedir(), 'logout', name)
    }
  )
}
