import { beforeEach, describe, expect, it, vi } from 'vitest'

interface GhCall { args: string[]; cwd?: string }
const calls: GhCall[] = []
let nextOutputs: Array<string | Error> = []

const fakeExecFile = (
  _cmd: string,
  args: string[],
  opts: { cwd?: string },
  cb: (err: Error | null, result: { stdout: string }) => void
): void => {
  calls.push({ args, cwd: opts?.cwd })
  const out = nextOutputs.shift()
  if (out instanceof Error) cb(out, { stdout: '' })
  else cb(null, { stdout: out ?? '' })
}

vi.mock('child_process', () => ({ default: { execFile: fakeExecFile }, execFile: fakeExecFile }))

const missing = (): Error => Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
const failing = (stderr: string): Error => Object.assign(new Error('exit 1'), { stderr })

let mod: typeof import('./gh-service')

beforeEach(async () => {
  calls.length = 0
  nextOutputs = []
  vi.resetModules()
  mod = await import('./gh-service')
})

describe('getGhStatus', () => {
  it('reports available + authenticated when auth status succeeds', async () => {
    nextOutputs = ['ok']
    expect(await mod.getGhStatus()).toEqual({ available: true, authenticated: true, message: null })
    expect(calls[0].args).toEqual(['auth', 'status'])
  })

  it('reports not installed on ENOENT', async () => {
    nextOutputs = [missing()]
    const status = await mod.getGhStatus()
    expect(status.available).toBe(false)
    expect(status.message).toMatch(/not installed/)
  })

  it('reports unauthenticated with the stderr text', async () => {
    nextOutputs = [failing('You are not logged into any GitHub hosts')]
    expect(await mod.getGhStatus()).toEqual({ available: true, authenticated: false, message: 'You are not logged into any GitHub hosts' })
  })
})

describe('getPrForBranch', () => {
  it('parses url and state from gh pr view', async () => {
    nextOutputs = [JSON.stringify({ url: 'https://github.com/o/r/pull/7', state: 'MERGED' })]
    expect(await mod.getPrForBranch('/wt')).toEqual({ url: 'https://github.com/o/r/pull/7', state: 'merged' })
    expect(calls[0]).toEqual({ args: ['pr', 'view', '--json', 'url,state'], cwd: '/wt' })
  })

  it('returns none when no PR exists for the branch', async () => {
    nextOutputs = [failing('no pull requests found for branch "llm/x"')]
    expect(await mod.getPrForBranch('/wt')).toEqual({ url: null, state: 'none' })
  })

  it('returns unknown when gh is missing or errors otherwise', async () => {
    nextOutputs = [missing()]
    expect(await mod.getPrForBranch('/wt')).toEqual({ url: null, state: 'unknown' })
    nextOutputs = [failing('HTTP 401')]
    expect(await mod.getPrForBranch('/wt')).toEqual({ url: null, state: 'unknown' })
  })
})
