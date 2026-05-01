import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakePty {
  cwd: string
  cols: number
  rows: number
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitData: (chunk: string) => void
  emitExit: (code: number) => void
}

const ptyInstances: FakePty[] = []
let nextSpawn: { onData?: (cb: (s: string) => void) => void; onExit?: (cb: (e: { exitCode: number }) => void) => void } | null = null

vi.mock('node-pty', () => ({
  spawn: vi.fn((_shell: string, _args: string[], opts: { cwd: string; cols: number; rows: number }) => {
    let onDataCb: ((s: string) => void) | null = null
    let onExitCb: ((e: { exitCode: number }) => void) | null = null
    const inst: FakePty = {
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      emitData: (chunk: string) => onDataCb?.(chunk),
      emitExit: (exitCode: number) => onExitCb?.({ exitCode })
    }
    nextSpawn = {
      onData: (cb) => { onDataCb = cb },
      onExit: (cb) => { onExitCb = cb }
    }
    ptyInstances.push(inst)
    return {
      onData: (cb: (s: string) => void) => nextSpawn!.onData!(cb),
      onExit: (cb: (e: { exitCode: number }) => void) => nextSpawn!.onExit!(cb),
      write: inst.write,
      resize: inst.resize,
      kill: inst.kill
    } as never
  })
}))

const mockLoadScrollback = vi.fn(() => '')
const mockAppendScrollback = vi.fn()
const mockClearScrollback = vi.fn()
const mockFlushScrollback = vi.fn()

vi.mock('@main/services/terminal-scrollback', () => ({
  loadScrollback: (id: string) => mockLoadScrollback(id),
  appendScrollback: (id: string, c: string) => mockAppendScrollback(id, c),
  clearScrollback: (id: string) => mockClearScrollback(id),
  flushScrollback: () => mockFlushScrollback()
}))

vi.mock('electron', () => ({ BrowserWindow: class {} }))
vi.mock('fs', () => ({
  default: { existsSync: () => true },
  existsSync: () => true
}))
vi.mock('os', () => ({
  default: { platform: () => 'darwin', homedir: () => '/home' },
  platform: () => 'darwin',
  homedir: () => '/home'
}))
vi.mock('child_process', () => ({
  default: { execSync: () => '' },
  execSync: () => ''
}))

const makeWin = (): { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } } => ({
  isDestroyed: () => false,
  webContents: { send: vi.fn() }
})

async function importFresh(): Promise<typeof import('./pty-manager')> {
  vi.resetModules()
  ptyInstances.length = 0
  mockLoadScrollback.mockClear()
  mockAppendScrollback.mockClear()
  mockClearScrollback.mockClear()
  mockFlushScrollback.mockClear()
  return import('./pty-manager')
}

describe('pty-manager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createPty', () => {
    it('spawns a pty, registers the instance, and reports it via hasPty', async () => {
      const mod = await importFresh()
      const win = makeWin()
      mod.createPty('t1', 'p1', '/cwd', win as never, 100, 30)

      expect(ptyInstances).toHaveLength(1)
      expect(ptyInstances[0].cols).toBe(100)
      expect(ptyInstances[0].rows).toBe(30)
      expect(mod.hasPty('t1')).toBe(true)
      expect(mod.hasPty('t2')).toBe(false)
    })

    it('replays saved scrollback to the renderer on creation', async () => {
      const mod = await importFresh()
      mockLoadScrollback.mockReturnValueOnce('previous output')
      const win = makeWin()
      mod.createPty('t1', 'p1', '/cwd', win as never)

      expect(win.webContents.send).toHaveBeenCalledWith(
        'terminal:data',
        't1',
        expect.stringContaining('previous output')
      )
      expect(win.webContents.send).toHaveBeenCalledWith(
        'terminal:data',
        't1',
        expect.stringContaining('session restored')
      )
    })
  })

  describe('data batching', () => {
    it('coalesces chunks within 16ms before sending one terminal:data event', async () => {
      const mod = await importFresh()
      const win = makeWin()
      mod.createPty('t1', 'p1', '/cwd', win as never)
      win.webContents.send.mockClear()

      const inst = ptyInstances[0]
      inst.emitData('hello ')
      inst.emitData('world')

      expect(mockAppendScrollback).toHaveBeenCalledWith('t1', 'hello ')
      expect(mockAppendScrollback).toHaveBeenCalledWith('t1', 'world')
      expect(win.webContents.send).not.toHaveBeenCalled()

      vi.advanceTimersByTime(16)
      expect(win.webContents.send).toHaveBeenCalledTimes(1)
      expect(win.webContents.send).toHaveBeenCalledWith('terminal:data', 't1', 'hello world')
    })

    it('flushes pending data when the pty exits and emits terminal:exit', async () => {
      const mod = await importFresh()
      const win = makeWin()
      mod.createPty('t1', 'p1', '/cwd', win as never)
      win.webContents.send.mockClear()

      const inst = ptyInstances[0]
      inst.emitData('tail-bytes')
      inst.emitExit(0)

      expect(win.webContents.send).toHaveBeenCalledWith('terminal:data', 't1', 'tail-bytes')
      expect(win.webContents.send).toHaveBeenCalledWith('terminal:exit', 't1', 0)
      expect(mod.hasPty('t1')).toBe(false)
    })
  })

  describe('writePty / resizePty', () => {
    it('forwards write and resize to the underlying pty', async () => {
      const mod = await importFresh()
      mod.createPty('t1', 'p1', '/cwd', makeWin() as never)
      const inst = ptyInstances[0]

      mod.writePty('t1', 'echo hi\r')
      mod.resizePty('t1', 120, 40)

      expect(inst.write).toHaveBeenCalledWith('echo hi\r')
      expect(inst.resize).toHaveBeenCalledWith(120, 40)
    })

    it('is a no-op for unknown tabs', async () => {
      const mod = await importFresh()
      expect(() => mod.writePty('nope', 'x')).not.toThrow()
      expect(() => mod.resizePty('nope', 100, 30)).not.toThrow()
    })
  })

  describe('killPty', () => {
    it('kills the process, removes the instance, and clears scrollback', async () => {
      const mod = await importFresh()
      mod.createPty('t1', 'p1', '/cwd', makeWin() as never)
      const inst = ptyInstances[0]

      mod.killPty('t1')

      expect(inst.kill).toHaveBeenCalled()
      expect(mockClearScrollback).toHaveBeenCalledWith('t1')
      expect(mod.hasPty('t1')).toBe(false)
    })

    it('clears scrollback even when no pty exists for the tab', async () => {
      const mod = await importFresh()
      mod.killPty('ghost')
      expect(mockClearScrollback).toHaveBeenCalledWith('ghost')
    })
  })

  describe('killAll', () => {
    it('flushes scrollback, kills every pty, and empties the registry', async () => {
      const mod = await importFresh()
      mod.createPty('t1', 'p1', '/cwd', makeWin() as never)
      mod.createPty('t2', 'p1', '/cwd', makeWin() as never)

      mod.killAll()

      expect(mockFlushScrollback).toHaveBeenCalledTimes(1)
      expect(ptyInstances[0].kill).toHaveBeenCalled()
      expect(ptyInstances[1].kill).toHaveBeenCalled()
      expect(mod.hasPty('t1')).toBe(false)
      expect(mod.hasPty('t2')).toBe(false)
    })

    it('clears any pending flush timer when killing the last instance', async () => {
      const mod = await importFresh()
      const win = makeWin()
      mod.createPty('t1', 'p1', '/cwd', win as never)
      ptyInstances[0].emitData('buffered')

      mod.killAll()

      // Timer should be cleared, so advancing past the batch interval must
      // not produce any more terminal:data sends after killAll.
      win.webContents.send.mockClear()
      vi.advanceTimersByTime(50)
      expect(win.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('killPty timer cleanup', () => {
    it('clears the pending flush timer instead of sending a stale batch', async () => {
      const mod = await importFresh()
      const win = makeWin()
      mod.createPty('t1', 'p1', '/cwd', win as never)
      ptyInstances[0].emitData('queued')
      win.webContents.send.mockClear()

      mod.killPty('t1')
      vi.advanceTimersByTime(50)

      expect(win.webContents.send).not.toHaveBeenCalledWith('terminal:data', 't1', 'queued')
      expect(ptyInstances[0].kill).toHaveBeenCalled()
    })
  })

  describe('flushPending guards', () => {
    it('skips the IPC send when the window is destroyed at flush time', async () => {
      const mod = await importFresh()
      let destroyed = false
      const win = {
        isDestroyed: () => destroyed,
        webContents: { send: vi.fn() }
      }
      mod.createPty('t1', 'p1', '/cwd', win as never)
      ptyInstances[0].emitData('hello')

      destroyed = true
      vi.advanceTimersByTime(16)

      expect(win.webContents.send).not.toHaveBeenCalledWith('terminal:data', 't1', 'hello')
    })
  })

  describe('createPty cwd fallback', () => {
    it('creates the pty when the requested cwd exists', async () => {
      const mod = await importFresh()
      mod.createPty('t1', 'p1', '/some/cwd', makeWin() as never)
      expect(ptyInstances[0].cwd).toBe('/some/cwd')
    })
  })
})
