import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const createPty = vi.fn()
const writePty = vi.fn()
const resizePty = vi.fn()
const killPty = vi.fn()
const hasPty = vi.fn(() => false)

vi.mock('@main/services/pty-manager', () => ({
  createPty: (...args: unknown[]) => createPty(...args),
  writePty: (...args: unknown[]) => writePty(...args),
  resizePty: (...args: unknown[]) => resizePty(...args),
  killPty: (...args: unknown[]) => killPty(...args),
  hasPty: (...args: unknown[]) => hasPty(...args)
}))

const fromWebContents = vi.fn(() => ({ id: 'win' } as unknown))
const writeImage = vi.fn()
const readImage = vi.fn(() => ({ isEmpty: () => true }))
const createFromPath = vi.fn(() => ({ isEmpty: () => true }))

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  BrowserWindow: { fromWebContents: () => fromWebContents() },
  nativeImage: { createFromPath: (p: string) => createFromPath(p) },
  clipboard: { writeImage: (img: unknown) => writeImage(img), readImage: () => readImage() }
}))

let registry: IpcRegistry

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({
    ipcMain: makeIpcMainMock(registry),
    BrowserWindow: { fromWebContents: () => fromWebContents() },
    nativeImage: { createFromPath: (p: string) => createFromPath(p) },
    clipboard: { writeImage: (img: unknown) => writeImage(img), readImage: () => readImage() }
  }))
  createPty.mockClear()
  writePty.mockClear()
  resizePty.mockClear()
  killPty.mockClear()
  hasPty.mockReset().mockReturnValue(false)
  fromWebContents.mockReset().mockReturnValue({ id: 'win' } as unknown)
  writeImage.mockClear()
  readImage.mockReset().mockReturnValue({ isEmpty: () => true })
  createFromPath.mockReset().mockReturnValue({ isEmpty: () => true })

  const { registerTerminalHandlers } = await import('./terminal')
  registerTerminalHandlers()
})

describe('terminal ipc', () => {
  it('terminal:create resolves the window and forwards args to createPty', async () => {
    await invoke(registry, 'terminal:create', 't1', 'p1', '/cwd', 80, 24)
    expect(createPty).toHaveBeenCalledWith('t1', 'p1', '/cwd', { id: 'win' }, 80, 24)
  })

  it('terminal:create skips creation when no window can be resolved', async () => {
    fromWebContents.mockReturnValueOnce(null as unknown)
    await invoke(registry, 'terminal:create', 't1', 'p1', '/cwd', 80, 24)
    expect(createPty).not.toHaveBeenCalled()
  })

  it('terminal:write/resize/kill/has forward to the matching pty fn', async () => {
    await invoke(registry, 'terminal:write', 't1', 'data')
    await invoke(registry, 'terminal:resize', 't1', 100, 30)
    await invoke(registry, 'terminal:kill', 't1')
    await invoke(registry, 'terminal:has', 't1')
    expect(writePty).toHaveBeenCalledWith('t1', 'data')
    expect(resizePty).toHaveBeenCalledWith('t1', 100, 30)
    expect(killPty).toHaveBeenCalledWith('t1')
    expect(hasPty).toHaveBeenCalledWith('t1')
  })

  it('terminal:paste-image writes the image and sends Ctrl-V when image is non-empty', async () => {
    createFromPath.mockReturnValueOnce({ isEmpty: () => false })
    await invoke(registry, 'terminal:paste-image', 't1', '/file.png')
    expect(writeImage).toHaveBeenCalled()
    expect(writePty).toHaveBeenCalledWith('t1', '\x16')
  })

  it('terminal:paste-image is a no-op when the image is empty', async () => {
    createFromPath.mockReturnValueOnce({ isEmpty: () => true })
    await invoke(registry, 'terminal:paste-image', 't1', '/empty.png')
    expect(writeImage).not.toHaveBeenCalled()
    expect(writePty).not.toHaveBeenCalled()
  })

  it('terminal:paste-clipboard-image returns true and writes Ctrl-V when clipboard has an image', async () => {
    readImage.mockReturnValueOnce({ isEmpty: () => false })
    const result = await invoke<boolean>(registry, 'terminal:paste-clipboard-image', 't1')
    expect(result).toBe(true)
    expect(writePty).toHaveBeenCalledWith('t1', '\x16')
  })

  it('terminal:paste-clipboard-image returns false when clipboard is empty', async () => {
    readImage.mockReturnValueOnce({ isEmpty: () => true })
    const result = await invoke<boolean>(registry, 'terminal:paste-clipboard-image', 't1')
    expect(result).toBe(false)
    expect(writePty).not.toHaveBeenCalled()
  })
})
