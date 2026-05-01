import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const listeners = new Map<string, Listener[]>()
const checkForUpdates = vi.fn(async () => null)
const quitAndInstall = vi.fn()
let currentVersion = { version: '1.0.0' }

const autoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  logger: undefined as unknown,
  on(event: string, cb: Listener) {
    const arr = listeners.get(event) ?? []
    arr.push(cb)
    listeners.set(event, arr)
  },
  emit(event: string, ...args: unknown[]) {
    for (const cb of listeners.get(event) ?? []) cb(...args)
  },
  checkForUpdates,
  quitAndInstall,
  get currentVersion(): { version: string } {
    return currentVersion
  }
}

vi.mock('electron-updater', () => ({ autoUpdater }))

const send = vi.fn()
const showMessageBox = vi.fn(async () => ({ response: 0, checkboxChecked: false }))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
  dialog: { showMessageBox: (opts: unknown) => showMessageBox(opts) }
}))

let mod: typeof import('./auto-updater')

beforeEach(async () => {
  vi.resetModules()
  listeners.clear()
  send.mockClear()
  showMessageBox.mockClear()
  checkForUpdates.mockReset()
  checkForUpdates.mockResolvedValue(null)
  quitAndInstall.mockClear()
  currentVersion = { version: '1.0.0' }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = undefined
  mod = await import('./auto-updater')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('auto-updater', () => {
  describe('initAutoUpdater', () => {
    it('configures the auto-updater and registers all status listeners', () => {
      mod.initAutoUpdater()
      expect(autoUpdater.autoDownload).toBe(true)
      expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
      expect(autoUpdater.logger).toBeNull()
      const eventNames = ['checking-for-update', 'update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'error']
      for (const name of eventNames) {
        expect(listeners.get(name)?.length ?? 0).toBeGreaterThan(0)
      }
    })

    it('broadcasts state on each lifecycle event', () => {
      mod.initAutoUpdater()

      autoUpdater.emit('checking-for-update')
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'checking' })

      autoUpdater.emit('update-available', { version: '2.0.0' })
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'available', version: '2.0.0' })

      autoUpdater.emit('update-not-available')
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'not-available' })

      autoUpdater.emit('download-progress', { percent: 42.7 })
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'downloading', percent: 43 })

      autoUpdater.emit('update-downloaded', { version: '2.0.0' })
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'downloaded', version: '2.0.0' })

      expect(mod.getUpdateStatus()).toEqual({ state: 'downloaded', version: '2.0.0' })
    })

    it('swallows 404 errors silently', () => {
      mod.initAutoUpdater()
      send.mockClear()
      autoUpdater.emit('error', new Error('Cannot find latest.yml: 404 Not Found'))
      expect(send).not.toHaveBeenCalled()
    })

    it('broadcasts non-404 errors with their message', () => {
      mod.initAutoUpdater()
      autoUpdater.emit('error', new Error('Network unreachable'))
      expect(send).toHaveBeenLastCalledWith('updater:status', { state: 'error', error: 'Network unreachable' })
    })
  })

  describe('checkForUpdates', () => {
    it('delegates to autoUpdater.checkForUpdates and swallows rejections', async () => {
      checkForUpdates.mockRejectedValueOnce(new Error('boom'))
      expect(() => mod.checkForUpdates()).not.toThrow()
      await Promise.resolve()
      expect(checkForUpdates).toHaveBeenCalledTimes(1)
    })
  })

  describe('checkForUpdatesInteractive', () => {
    it('shows an error dialog when the check throws', async () => {
      checkForUpdates.mockRejectedValueOnce(new Error('cannot reach server'))
      await mod.checkForUpdatesInteractive()
      expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        title: 'Update Error',
        detail: 'cannot reach server'
      }))
    })

    it('shows a "no updates" dialog when the latest version equals the current one', async () => {
      currentVersion = { version: '1.2.3' }
      checkForUpdates.mockResolvedValueOnce({ updateInfo: { version: '1.2.3' } } as never)
      await mod.checkForUpdatesInteractive()
      expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
        type: 'info',
        title: 'No Updates',
        detail: 'vbcdr v1.2.3'
      }))
    })

    it('shows no dialog when an actual update is available', async () => {
      currentVersion = { version: '1.0.0' }
      checkForUpdates.mockResolvedValueOnce({ updateInfo: { version: '1.2.3' } } as never)
      await mod.checkForUpdatesInteractive()
      expect(showMessageBox).not.toHaveBeenCalled()
    })

    it('returns silently when checkForUpdates resolves null', async () => {
      checkForUpdates.mockResolvedValueOnce(null)
      await mod.checkForUpdatesInteractive()
      expect(showMessageBox).not.toHaveBeenCalled()
    })
  })

  describe('quitAndInstall', () => {
    it('forwards to the auto-updater', () => {
      mod.quitAndInstall()
      expect(quitAndInstall).toHaveBeenCalledTimes(1)
    })
  })

  describe('getUpdateStatus', () => {
    it('starts as idle before any lifecycle events', () => {
      expect(mod.getUpdateStatus()).toEqual({ state: 'idle' })
    })
  })
})
