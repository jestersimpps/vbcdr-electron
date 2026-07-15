import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const state = vi.hoisted(() => ({
  home: '',
  statusOutput: '',
  ptyOutput: '',
  ptyExitCode: 0
}))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  const homedir = (): string => state.home
  return { ...actual, homedir, default: { ...actual, homedir } }
})

vi.mock('electron', () => ({ ipcMain: { handle: () => undefined } }))

vi.mock('child_process', () => {
  const spawn = vi.fn(() => {
    const listeners = new Map<string, (arg?: unknown) => void>()
    const proc = {
      stdout: { on: (_ev: string, cb: (d: Buffer) => void) => listeners.set('stdout', cb as never) },
      stderr: { on: (_ev: string, cb: (d: Buffer) => void) => listeners.set('stderr', cb as never) },
      on: (ev: string, cb: () => void) => listeners.set(ev, cb as never),
      kill: vi.fn()
    }
    queueMicrotask(() => {
      listeners.get('stdout')?.(Buffer.from(state.statusOutput))
      listeners.get('close')?.()
    })
    return proc
  })
  return { spawn, default: { spawn } }
})

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    let onData: ((d: string) => void) | null = null
    let onExit: ((e: { exitCode: number }) => void) | null = null
    queueMicrotask(() => {
      onData?.(state.ptyOutput)
      onExit?.({ exitCode: state.ptyExitCode })
    })
    return {
      onData: (cb: (d: string) => void) => {
        onData = cb
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        onExit = cb
      },
      kill: vi.fn()
    }
  })
}))

let registry: IpcRegistry
let projectPath = ''

const claudeJsonPath = (): string => path.join(state.home, '.claude.json')
const mcpJsonPath = (): string => path.join(projectPath, '.mcp.json')

const readJson = <T = unknown>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
const writeJson = (filePath: string, data: unknown): void => {
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
}

beforeEach(async () => {
  const os = await vi.importActual<typeof import('os')>('os')
  state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-home-'))
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proj-'))
  state.statusOutput = ''
  state.ptyOutput = ''
  state.ptyExitCode = 0

  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({ ipcMain: makeIpcMainMock(registry) }))
  const { registerMcpHandlers } = await import('./mcp')
  registerMcpHandlers()
})

afterEach(() => {
  fs.rmSync(state.home, { recursive: true, force: true })
  fs.rmSync(projectPath, { recursive: true, force: true })
})

describe('mcp:list', () => {
  it('merges user, local, and project scopes with enabled flags', async () => {
    writeJson(claudeJsonPath(), {
      mcpServers: { userSrv: { type: 'http', url: 'https://user.example' } },
      projects: {
        [projectPath]: {
          mcpServers: { localSrv: { command: 'local-cmd' } },
          disabledMcpjsonServers: ['projOff']
        }
      }
    })
    writeJson(mcpJsonPath(), {
      mcpServers: {
        projOn: { command: 'on-cmd' },
        projOff: { command: 'off-cmd' }
      }
    })

    type Entry = { name: string; scope: string; enabled: boolean; config: { url?: string } }
    const entries = await invoke<Entry[]>(registry, 'mcp:list', projectPath)
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]))

    expect(entries).toHaveLength(4)
    expect(byName.userSrv).toMatchObject({ scope: 'user', enabled: true, config: { url: 'https://user.example' } })
    expect(byName.localSrv).toMatchObject({ scope: 'local', enabled: true })
    expect(byName.projOn).toMatchObject({ scope: 'project', enabled: true })
    expect(byName.projOff).toMatchObject({ scope: 'project', enabled: false })
  })

  it('returns only user servers when no project path is given', async () => {
    writeJson(claudeJsonPath(), {
      mcpServers: { userSrv: { command: 'x' } },
      projects: { [projectPath]: { mcpServers: { localSrv: { command: 'y' } } } }
    })
    const entries = await invoke<Array<{ name: string }>>(registry, 'mcp:list', null)
    expect(entries.map((e) => e.name)).toEqual(['userSrv'])
  })

  it('returns an empty list when no config files exist', async () => {
    const entries = await invoke<unknown[]>(registry, 'mcp:list', projectPath)
    expect(entries).toEqual([])
  })
})

describe('mcp:upsert', () => {
  it('writes user-scope servers to ~/.claude.json and trims the name', async () => {
    await invoke(registry, 'mcp:upsert', 'user', null, '  srv  ', { command: 'run-it' })
    const json = readJson<{ mcpServers: Record<string, { command: string }> }>(claudeJsonPath())
    expect(json.mcpServers.srv).toEqual({ command: 'run-it' })
  })

  it('preserves unrelated keys in ~/.claude.json', async () => {
    writeJson(claudeJsonPath(), { numStartups: 5, mcpServers: { old: { command: 'keep' } } })
    await invoke(registry, 'mcp:upsert', 'user', null, 'srv', { command: 'new' })
    const json = readJson<{ numStartups: number; mcpServers: Record<string, unknown> }>(claudeJsonPath())
    expect(json.numStartups).toBe(5)
    expect(Object.keys(json.mcpServers).sort()).toEqual(['old', 'srv'])
  })

  it('writes project-scope servers to <project>/.mcp.json', async () => {
    await invoke(registry, 'mcp:upsert', 'project', projectPath, 'srv', { type: 'http', url: 'https://x' })
    const json = readJson<{ mcpServers: Record<string, { url: string }> }>(mcpJsonPath())
    expect(json.mcpServers.srv.url).toBe('https://x')
  })

  it('writes local-scope servers under projects[path] in ~/.claude.json', async () => {
    await invoke(registry, 'mcp:upsert', 'local', projectPath, 'srv', { command: 'z' })
    const json = readJson<{ projects: Record<string, { mcpServers: Record<string, { command: string }> }> }>(claudeJsonPath())
    expect(json.projects[projectPath].mcpServers.srv).toEqual({ command: 'z' })
  })

  it('rejects an empty name', async () => {
    await expect(invoke(registry, 'mcp:upsert', 'user', null, '   ', {})).rejects.toThrow(/name is required/i)
  })

  it('rejects project and local scopes without a project path', async () => {
    await expect(invoke(registry, 'mcp:upsert', 'project', null, 'srv', {})).rejects.toThrow(/active project/)
    await expect(invoke(registry, 'mcp:upsert', 'local', null, 'srv', {})).rejects.toThrow(/active project/)
  })
})

describe('mcp:remove', () => {
  it('removes only the named server from the given scope', async () => {
    writeJson(mcpJsonPath(), { mcpServers: { a: { command: 'a' }, b: { command: 'b' } } })
    await invoke(registry, 'mcp:remove', 'project', projectPath, 'a')
    const json = readJson<{ mcpServers: Record<string, unknown> }>(mcpJsonPath())
    expect(Object.keys(json.mcpServers)).toEqual(['b'])
  })
})

describe('mcp:set-enabled', () => {
  it('moves the server between enabled and disabled lists', async () => {
    await invoke(registry, 'mcp:set-enabled', projectPath, 'srv', false)
    type ClaudeProjects = { projects: Record<string, { enabledMcpjsonServers: string[]; disabledMcpjsonServers: string[] }> }
    let project = readJson<ClaudeProjects>(claudeJsonPath()).projects[projectPath]
    expect(project.disabledMcpjsonServers).toContain('srv')
    expect(project.enabledMcpjsonServers).not.toContain('srv')

    await invoke(registry, 'mcp:set-enabled', projectPath, 'srv', true)
    project = readJson<ClaudeProjects>(claudeJsonPath()).projects[projectPath]
    expect(project.enabledMcpjsonServers).toContain('srv')
    expect(project.disabledMcpjsonServers).not.toContain('srv')
  })
})

describe('mcp:status', () => {
  it('parses claude mcp list output into health entries', async () => {
    state.statusOutput = [
      'Checking MCP server health...',
      '',
      'supabase: npx -y @supabase/mcp-server - ✓ Connected',
      'notion: https://mcp.notion.com/mcp (HTTP) - ⚠ Needs authentication · run /mcp',
      'broken: bad-cmd - ✗ Failed to connect'
    ].join('\n')

    type Status = { name: string; target: string; health: string; detail: string }
    const entries = await invoke<Status[]>(registry, 'mcp:status', projectPath)

    expect(entries).toHaveLength(3)
    expect(entries[0]).toEqual({
      name: 'supabase',
      target: 'npx -y @supabase/mcp-server',
      health: 'connected',
      detail: 'Connected'
    })
    expect(entries[1].health).toBe('needs-auth')
    expect(entries[1].target).toBe('https://mcp.notion.com/mcp (HTTP)')
    expect(entries[2].health).toBe('failed')
  })

  it('returns an empty list when the CLI prints nothing parseable', async () => {
    state.statusOutput = 'No MCP servers configured.\n'
    const entries = await invoke<unknown[]>(registry, 'mcp:status', null)
    expect(entries).toEqual([])
  })
})

describe('mcp:login / mcp:logout', () => {
  it('resolves with the exit code and ANSI-stripped output', async () => {
    state.ptyOutput = '\x1b[32mLogin successful\x1b[0m\r\n'
    state.ptyExitCode = 0
    const result = await invoke<{ code: number; output: string }>(registry, 'mcp:login', projectPath, 'srv')
    expect(result.code).toBe(0)
    expect(result.output).toContain('Login successful')
    expect(result.output).not.toContain('\x1b')
    expect(result.output).not.toContain('\r')
  })

  it('reports a non-zero exit code on failed logout', async () => {
    state.ptyOutput = 'error: unknown server\r\n'
    state.ptyExitCode = 1
    const result = await invoke<{ code: number; output: string }>(registry, 'mcp:logout', null, 'srv')
    expect(result.code).toBe(1)
    expect(result.output).toContain('unknown server')
  })
})
