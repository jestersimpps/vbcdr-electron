import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

let homeDir = ''
let projectDir = ''
let originalHome: string | undefined

vi.mock('child_process', () => ({
  default: { spawn: () => ({ stdout: { on: () => undefined }, stderr: { on: () => undefined }, on: () => undefined }), execSync: () => '' },
  spawn: () => ({
    stdout: { on: () => undefined },
    stderr: { on: () => undefined },
    on: (event: string, cb: (code: number) => void) => {
      if (event === 'close') setTimeout(() => cb(0), 0)
    }
  }),
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
  })
})
