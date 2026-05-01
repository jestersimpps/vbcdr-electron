import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This sibling test file targets the platform-detection and PATH-resolution
// branches of pty-manager that the main test file pins down with always-true
// fs/exec mocks.

interface FakePty {
  cwd: string
  shell: string
  envPath: string | undefined
  envShell: string | undefined
  envTerm: string | undefined
}

const ptyInstances: FakePty[] = []

vi.mock('node-pty', () => ({
  spawn: vi.fn((shell: string, _args: string[], opts: { cwd: string; env: Record<string, string> }) => {
    ptyInstances.push({
      cwd: opts.cwd,
      shell,
      envPath: opts.env.PATH,
      envShell: opts.env.SHELL,
      envTerm: opts.env.TERM
    })
    return {
      onData: () => undefined,
      onExit: () => undefined,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    } as never
  })
}))

vi.mock('@main/services/terminal-scrollback', () => ({
  loadScrollback: () => '',
  appendScrollback: () => undefined,
  clearScrollback: () => undefined,
  flushScrollback: () => undefined
}))

vi.mock('electron', () => ({ BrowserWindow: class {} }))

const fsState = {
  existing: new Set<string>(),
  shouldExist: (p: string) => fsState.existing.has(p)
}

vi.mock('fs', () => ({
  default: { existsSync: (p: string) => fsState.shouldExist(p) },
  existsSync: (p: string) => fsState.shouldExist(p)
}))

const osState = { platform: 'darwin' as 'darwin' | 'linux' | 'win32', homedir: '/home/user' }

vi.mock('os', () => ({
  default: { platform: () => osState.platform, homedir: () => osState.homedir },
  platform: () => osState.platform,
  homedir: () => osState.homedir
}))

const execState = {
  responses: new Map<string, string | (() => string)>(),
  calls: [] as string[]
}

vi.mock('child_process', () => {
  const execSync = (cmd: string): string => {
    execState.calls.push(cmd)
    const r = execState.responses.get(cmd)
    if (typeof r === 'function') return r()
    if (r === undefined) throw new Error(`unmocked execSync: ${cmd}`)
    return r
  }
  return {
    default: { execSync },
    execSync
  }
})

const makeWin = (): { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } } => ({
  isDestroyed: () => false,
  webContents: { send: vi.fn() }
})

async function importFresh(): Promise<typeof import('./pty-manager')> {
  vi.resetModules()
  ptyInstances.length = 0
  execState.calls.length = 0
  return import('./pty-manager')
}

beforeEach(() => {
  fsState.existing = new Set()
  osState.platform = 'darwin'
  osState.homedir = '/home/user'
  execState.responses = new Map()
  delete process.env.SHELL
})

afterEach(() => {
  delete process.env.SHELL
})

describe('defaultShell', () => {
  it('uses $SHELL when it exists on disk', async () => {
    process.env.SHELL = '/opt/homebrew/bin/fish'
    fsState.existing.add('/opt/homebrew/bin/fish')
    fsState.existing.add('/cwd')

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].shell).toBe('/opt/homebrew/bin/fish')
  })

  it('falls back to dscl-reported shell on darwin when $SHELL is missing', async () => {
    osState.platform = 'darwin'
    fsState.existing.add('/cwd')
    fsState.existing.add('/usr/local/bin/zsh')
    execState.responses.set('dscl . -read /Users/$USER UserShell', 'UserShell: /usr/local/bin/zsh')

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].shell).toBe('/usr/local/bin/zsh')
  })

  it('falls back to /bin/zsh on darwin when dscl gives no usable answer', async () => {
    osState.platform = 'darwin'
    fsState.existing.add('/cwd')
    fsState.existing.add('/bin/zsh')
    execState.responses.set('dscl . -read /Users/$USER UserShell', 'UserShell: /nonexistent')

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].shell).toBe('/bin/zsh')
  })

  it('falls back to /bin/bash on darwin when /bin/zsh is missing too', async () => {
    osState.platform = 'darwin'
    fsState.existing.add('/cwd')
    execState.responses.set('dscl . -read /Users/$USER UserShell', () => {
      throw new Error('not in a real darwin env')
    })

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].shell).toBe('/bin/bash')
  })

  it('returns powershell.exe on win32', async () => {
    osState.platform = 'win32'
    fsState.existing.add('/cwd')

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].shell).toBe('powershell.exe')
  })

  it('returns /bin/sh on linux when no other detection succeeds', async () => {
    osState.platform = 'linux'
    fsState.existing.add('/cwd')

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].shell).toBe('/bin/sh')
  })
})

describe('shellEnv PATH resolution', () => {
  it('queries a login shell for PATH when current PATH is missing /usr/local/bin', async () => {
    osState.platform = 'linux'
    fsState.existing.add('/cwd')
    process.env.PATH = '/usr/bin:/bin'
    execState.responses.set('/bin/bash -ilc "echo $PATH"', '/usr/local/bin:/usr/bin:/bin')

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].envPath).toBe('/usr/local/bin:/usr/bin:/bin')
  })

  it('keeps the existing PATH when it already includes /usr/local/bin', async () => {
    osState.platform = 'linux'
    fsState.existing.add('/cwd')
    process.env.PATH = '/usr/local/bin:/usr/bin'

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].envPath).toBe('/usr/local/bin:/usr/bin')
    expect(execState.calls.some((c) => c.includes('echo $PATH'))).toBe(false)
  })

  it('keeps the existing PATH when the login-shell lookup throws', async () => {
    osState.platform = 'linux'
    fsState.existing.add('/cwd')
    process.env.PATH = '/usr/bin:/bin'
    execState.responses.set('/bin/bash -ilc "echo $PATH"', () => {
      throw new Error('no login shell')
    })

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].envPath).toBe('/usr/bin:/bin')
  })

  it('always sets TERM to xterm-256color', async () => {
    osState.platform = 'linux'
    fsState.existing.add('/cwd')
    process.env.PATH = '/usr/local/bin'

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/cwd', makeWin() as never)

    expect(ptyInstances[0].envTerm).toBe('xterm-256color')
  })
})

describe('createPty cwd fallback', () => {
  it('falls back to homedir when the requested cwd does not exist', async () => {
    osState.platform = 'linux'
    osState.homedir = '/home/user'
    process.env.PATH = '/usr/local/bin'
    // Note: '/missing' is intentionally NOT in fsState.existing

    const mod = await importFresh()
    mod.createPty('t1', 'p1', '/missing', makeWin() as never)

    expect(ptyInstances[0].cwd).toBe('/home/user')
  })
})

describe('killOrphanedPtys', () => {
  it('sends SIGTERM only to vbcdr ptys whose ppid is 1', async () => {
    osState.platform = 'linux'
    process.env.PATH = '/usr/local/bin'
    execState.responses.set(
      'ps eww -ax -o pid,ppid,command',
      [
        '  PID  PPID COMMAND',
        '  100   500 unrelated process',
        '  200     1 /bin/zsh -l TERM_PROGRAM=vbcdr',
        '  300   400 /bin/zsh TERM_PROGRAM=vbcdr',
        '  400     1 /bin/sh other'
      ].join('\n')
    )
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    const mod = await importFresh()
    mod.killOrphanedPtys()

    expect(killSpy).toHaveBeenCalledWith(200, 'SIGTERM')
    expect(killSpy).not.toHaveBeenCalledWith(300, expect.anything())
    expect(killSpy).not.toHaveBeenCalledWith(400, expect.anything())
    killSpy.mockRestore()
  })

  it('swallows errors from the ps command', async () => {
    osState.platform = 'linux'
    process.env.PATH = '/usr/local/bin'
    execState.responses.set('ps eww -ax -o pid,ppid,command', () => {
      throw new Error('ps failed')
    })

    const mod = await importFresh()
    expect(() => mod.killOrphanedPtys()).not.toThrow()
  })

  it('ignores process.kill failures for already-dead processes', async () => {
    osState.platform = 'linux'
    process.env.PATH = '/usr/local/bin'
    execState.responses.set(
      'ps eww -ax -o pid,ppid,command',
      '  200     1 /bin/zsh TERM_PROGRAM=vbcdr'
    )
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH')
    })

    const mod = await importFresh()
    expect(() => mod.killOrphanedPtys()).not.toThrow()
    killSpy.mockRestore()
  })
})
