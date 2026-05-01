import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const checkForUpdates = vi.fn()
const quitAndInstall = vi.fn()
const getUpdateStatus = vi.fn(() => ({ state: 'idle' }))

vi.mock('@main/services/auto-updater', () => ({
  checkForUpdates: (...args: unknown[]) => checkForUpdates(...args),
  quitAndInstall: (...args: unknown[]) => quitAndInstall(...args),
  getUpdateStatus: () => getUpdateStatus()
}))

let registry: IpcRegistry

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({ ipcMain: makeIpcMainMock(registry) }))
  checkForUpdates.mockClear()
  quitAndInstall.mockClear()
  getUpdateStatus.mockReset().mockReturnValue({ state: 'idle' })
  const { registerUpdaterHandlers } = await import('./updater')
  registerUpdaterHandlers()
})

describe('updater ipc', () => {
  it('updater:check delegates to checkForUpdates', async () => {
    await invoke(registry, 'updater:check')
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('updater:install delegates to quitAndInstall', async () => {
    await invoke(registry, 'updater:install')
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('updater:status returns the current status', async () => {
    getUpdateStatus.mockReturnValueOnce({ state: 'downloaded', version: '2.0.0' })
    const status = await invoke(registry, 'updater:status')
    expect(status).toEqual({ state: 'downloaded', version: '2.0.0' })
  })
})
