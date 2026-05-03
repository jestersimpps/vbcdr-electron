import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

let homeDir = ''
let projectDir = ''
let originalHome: string | undefined

interface SpawnCall {
  command: string
  args: string[]
  options: { cwd?: string; env?: Record<string, string>; shell?: boolean }
  emitStdout: (chunk: string) => void
  emitStderr: (chunk: string) => void
  emitError: (err: Error) => void
  emitClose: (code: number) => void
}

const spawnCalls: SpawnCall[] = []

const spawnMock = vi.fn((command: string, args: string[], options: { cwd?: string; env?: Record<string, string>; shell?: boolean }) => {
  let stdoutCb: ((chunk: Buffer) => void) | null = null
  let stderrCb: ((chunk: Buffer) => void) | null = null
  let errorCb: ((err: Error) => void) | null = null
  let closeCb: ((code: number) => void) | null = null
  const call: SpawnCall = {
    command,
    args,
    options,
    emitStdout: (chunk) => stdoutCb?.(Buffer.from(chunk)),
    emitStderr: (chunk) => stderrCb?.(Buffer.from(chunk)),
    emitError: (err) => errorCb?.(err),
    emitClose: (code) => closeCb?.(code)
  }
  spawnCalls.push(call)
  return {
    stdout: { on: (_e: string, cb: (chunk: Buffer) => void) => { stdoutCb = cb } },
    stderr: { on: (_e: string, cb: (chunk: Buffer) => void) => { stderrCb = cb } },
    on: (event: string, cb: (...payload: unknown[]) => void) => {
      if (event === 'error') errorCb = cb as (err: Error) => void
      if (event === 'close') closeCb = cb as (code: number) => void
    }
  }
})

vi.mock('child_process', () => ({
  default: { spawn: spawnMock, execSync: () => '' },
  spawn: spawnMock,
  execSync: () => ''
}))

const send = vi.fn()

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  BrowserWindow: { fromWebContents: () => ({ webContents: { send } }) }
}))

let registry: IpcRegistry
let originalFetch: typeof fetch | undefined

beforeEach(async () => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'))
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'))
  originalHome = process.env.HOME
  process.env.HOME = homeDir
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({
    ipcMain: makeIpcMainMock(registry),
    BrowserWindow: { fromWebContents: () => ({ webContents: { send } }) }
  }))
  send.mockClear()
  spawnMock.mockClear()
  spawnCalls.length = 0
  originalFetch = globalThis.fetch
  const { registerSkillsHandlers } = await import('./skills')
  registerSkillsHandlers()
})

afterEach(() => {
  process.env.HOME = originalHome
  fs.rmSync(homeDir, { recursive: true, force: true })
  fs.rmSync(projectDir, { recursive: true, force: true })
  if (originalFetch) globalThis.fetch = originalFetch
})

describe('skills ipc', () => {
  describe('skills:search', () => {
    it('returns an empty result without hitting the network for short queries', async () => {
      const fetchSpy = vi.fn()
      globalThis.fetch = fetchSpy as unknown as typeof fetch
      const result = await invoke<{ skills: unknown[]; count: number; query: string }>(
        registry,
        'skills:search',
        ' a '
      )
      expect(result.skills).toEqual([])
      expect(result.count).toBe(0)
      expect(result.query).toBe('a')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('calls skills.sh search and returns parsed JSON', async () => {
      const json = { query: 'react', searchType: 'fuzzy', skills: [{ id: '1', skillId: 'react', name: 'React', installs: 5, source: 'gh' }], count: 1, duration_ms: 12 }
      globalThis.fetch = (vi.fn(async () => ({ ok: true, json: async () => json })) as unknown) as typeof fetch
      const result = await invoke(registry, 'skills:search', 'react')
      expect(result).toEqual(json)
    })

    it('throws when the search endpoint returns a non-2xx status', async () => {
      globalThis.fetch = (vi.fn(async () => ({ ok: false, status: 500 })) as unknown) as typeof fetch
      await expect(invoke(registry, 'skills:search', 'something')).rejects.toThrow(/500/)
    })
  })

  describe('skills:list', () => {
    it('returns global skills only when projectPath is null', async () => {
      const skillDir = path.join(homeDir, '.claude', 'skills', 'global-skill')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\ndescription: global one\n---\n')

      type Skill = { name: string; scope: 'project' | 'global'; description?: string }
      const result = await invoke<Skill[]>(registry, 'skills:list', null)
      expect(result).toEqual([{
        name: 'global-skill',
        path: skillDir,
        scope: 'global',
        description: 'global one'
      }])
    })

    it('returns project skills before global ones when projectPath is provided', async () => {
      const globalSkill = path.join(homeDir, '.claude', 'skills', 'g')
      fs.mkdirSync(globalSkill, { recursive: true })
      const projectSkill = path.join(projectDir, '.claude', 'skills', 'p')
      fs.mkdirSync(projectSkill, { recursive: true })

      type Skill = { name: string; scope: 'project' | 'global' }
      const result = await invoke<Skill[]>(registry, 'skills:list', projectDir)
      expect(result.map((s) => s.scope)).toEqual(['project', 'global'])
      expect(result.map((s) => s.name)).toEqual(['p', 'g'])
    })

    it('returns an empty array when neither dir exists', async () => {
      const result = await invoke<unknown[]>(registry, 'skills:list', null)
      expect(result).toEqual([])
    })

    it('skips entries that are not directories', async () => {
      const skillsDir = path.join(homeDir, '.claude', 'skills')
      fs.mkdirSync(skillsDir, { recursive: true })
      fs.writeFileSync(path.join(skillsDir, 'README.md'), 'not a skill')
      const dir = path.join(skillsDir, 'real-skill')
      fs.mkdirSync(dir)

      const result = await invoke<{ name: string }[]>(registry, 'skills:list', null)
      expect(result.map((s) => s.name)).toEqual(['real-skill'])
    })

    it('returns description undefined when SKILL.md has no frontmatter', async () => {
      const skillDir = path.join(homeDir, '.claude', 'skills', 'no-fm')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# just a heading\n')

      const result = await invoke<{ description?: string }[]>(registry, 'skills:list', null)
      expect(result[0].description).toBeUndefined()
    })

    it('returns description undefined when frontmatter has no description field', async () => {
      const skillDir = path.join(homeDir, '.claude', 'skills', 'no-desc')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: x\n---\n')

      const result = await invoke<{ description?: string }[]>(registry, 'skills:list', null)
      expect(result[0].description).toBeUndefined()
    })

    it('strips surrounding quotes from a quoted description', async () => {
      const skillDir = path.join(homeDir, '.claude', 'skills', 'quoted')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription: "wrapped in double quotes"\n---\n'
      )

      const result = await invoke<{ description?: string }[]>(registry, 'skills:list', null)
      expect(result[0].description).toBe('wrapped in double quotes')
    })
  })

  describe('skills:install', () => {
    it('runs `npx skills add` with the right args, streams output, and resolves with exit code', async () => {
      const promise = invoke<{ code: number; output: string }>(
        registry,
        'skills:install',
        'owner/repo',
        'cool-skill',
        'global',
        null
      )
      // Allow registerSkillsHandlers' async invocation to spawn before driving it
      await Promise.resolve()
      expect(spawnCalls).toHaveLength(1)
      const call = spawnCalls[0]
      expect(call.command.endsWith('npx') || call.command.endsWith('npx.cmd') || call.command.endsWith('npx.exe')).toBe(true)
      expect(call.args).toEqual(['-y', 'skills', 'add', 'owner/repo', '-s', 'cool-skill', '-a', 'claude-code', '--copy', '-y', '-g'])
      expect(call.options.cwd).toBe(os.homedir())
      expect(call.options.shell).toBe(process.platform === 'win32')

      call.emitStdout('progress 50%\n')
      call.emitStderr('warning: foo\n')
      call.emitClose(0)

      const result = await promise
      expect(result.code).toBe(0)
      expect(result.output).toBe('progress 50%\nwarning: foo\n')
      expect(send).toHaveBeenCalledWith('skills:output', 'progress 50%\n')
      expect(send).toHaveBeenCalledWith('skills:output', 'warning: foo\n')
    })

    it('uses the project path as cwd and omits -g flag for project scope', async () => {
      const promise = invoke<{ code: number }>(
        registry,
        'skills:install',
        'owner/repo',
        'cool-skill',
        'project',
        projectDir
      )
      await Promise.resolve()
      const call = spawnCalls[0]
      expect(call.options.cwd).toBe(projectDir)
      expect(call.args).not.toContain('-g')

      call.emitClose(0)
      await promise
    })

    it('falls back to home dir when project scope is given without a project path', async () => {
      const promise = invoke<{ code: number }>(
        registry,
        'skills:install',
        'owner/repo',
        'cool-skill',
        'project',
        null
      )
      await Promise.resolve()
      expect(spawnCalls[0].options.cwd).toBe(os.homedir())
      spawnCalls[0].emitClose(0)
      await promise
    })

    it('resolves with code -1 and an Error: line when spawn errors out', async () => {
      const promise = invoke<{ code: number; output: string }>(
        registry,
        'skills:install',
        'owner/repo',
        'cool-skill',
        'global',
        null
      )
      await Promise.resolve()
      spawnCalls[0].emitError(new Error('boom'))

      const result = await promise
      expect(result.code).toBe(-1)
      expect(result.output).toContain('Error: boom')
      expect(send).toHaveBeenCalledWith('skills:output', expect.stringContaining('Error: boom'))
    })

    it('propagates non-zero exit codes from the skills CLI', async () => {
      const promise = invoke<{ code: number }>(
        registry,
        'skills:install',
        'owner/repo',
        'cool-skill',
        'global',
        null
      )
      await Promise.resolve()
      spawnCalls[0].emitClose(2)
      const result = await promise
      expect(result.code).toBe(2)
    })
  })

  describe('skills:uninstall', () => {
    it('runs `npx skills remove` with -g for global scope', async () => {
      const promise = invoke<{ code: number }>(
        registry,
        'skills:uninstall',
        'cool-skill',
        'global',
        null
      )
      await Promise.resolve()
      const call = spawnCalls[0]
      expect(call.args).toEqual(['-y', 'skills', 'remove', 'cool-skill', '-y', '-g'])
      expect(call.options.cwd).toBe(os.homedir())

      call.emitClose(0)
      const result = await promise
      expect(result.code).toBe(0)
    })

    it('uses project cwd and omits -g for project scope', async () => {
      const promise = invoke<{ code: number }>(
        registry,
        'skills:uninstall',
        'cool-skill',
        'project',
        projectDir
      )
      await Promise.resolve()
      const call = spawnCalls[0]
      expect(call.args).toEqual(['-y', 'skills', 'remove', 'cool-skill', '-y'])
      expect(call.options.cwd).toBe(projectDir)

      call.emitClose(0)
      await promise
    })
  })
})
