import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const recordTokenSnapshot = vi.fn()
const resetTabTokenTracking = vi.fn()
const getDailyUsage = vi.fn(() => [])
const getEvents = vi.fn(() => [])

vi.mock('@main/services/token-usage-service', () => ({
  recordTokenSnapshot: (...args: unknown[]) => recordTokenSnapshot(...args),
  resetTabTokenTracking: (...args: unknown[]) => resetTabTokenTracking(...args),
  getDailyUsage: (...args: unknown[]) => getDailyUsage(...args),
  getEvents: (...args: unknown[]) => getEvents(...args)
}))

const readTranscriptUsage = vi.fn(() => null)
const getPtySpawnTime = vi.fn<(tabId: string) => number | null>(() => null)

vi.mock('@main/services/transcript-usage-service', () => ({
  readTranscriptUsage: (...args: unknown[]) => readTranscriptUsage(...(args as []))
}))

vi.mock('@main/services/pty-manager', () => ({
  getPtySpawnTime: (...args: unknown[]) => getPtySpawnTime(...(args as [string]))
}))

let registry: IpcRegistry

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({ ipcMain: makeIpcMainMock(registry) }))
  recordTokenSnapshot.mockClear()
  resetTabTokenTracking.mockClear()
  getDailyUsage.mockReset().mockReturnValue([])
  getEvents.mockReset().mockReturnValue([])
  readTranscriptUsage.mockReset().mockReturnValue(null)
  getPtySpawnTime.mockReset().mockReturnValue(null)
  const { registerTokenUsageHandlers } = await import('./token-usage')
  registerTokenUsageHandlers()
})

describe('token-usage ipc', () => {
  it('records a snapshot via recordTokenSnapshot', async () => {
    await invoke(registry, 'token-usage:record', 'tab1', 'p1', 1000)
    expect(recordTokenSnapshot).toHaveBeenCalledWith('tab1', 'p1', 1000)
  })

  it('resets tab tracking via resetTabTokenTracking', async () => {
    await invoke(registry, 'token-usage:reset-tab', 'tab1')
    expect(resetTabTokenTracking).toHaveBeenCalledWith('tab1')
  })

  it('reads transcript usage scoped to the tab pty spawn time', async () => {
    getPtySpawnTime.mockReturnValue(12345)
    await invoke(registry, 'token-usage:context', '/some/cwd', 'tab1')
    expect(getPtySpawnTime).toHaveBeenCalledWith('tab1')
    expect(readTranscriptUsage).toHaveBeenCalledWith('/some/cwd', 12345)
  })

  it('reads transcript usage without spawn time when no tab is given', async () => {
    await invoke(registry, 'token-usage:context', '/some/cwd')
    expect(readTranscriptUsage).toHaveBeenCalledWith('/some/cwd', null)
  })

  it('reads daily usage via getDailyUsage with the provided sinceIso', async () => {
    getDailyUsage.mockReturnValueOnce([{ date: '2026-05-01', total: 100, perProject: { p1: 100 } }])
    const result = await invoke(registry, 'token-usage:daily', '2026-04-01')
    expect(getDailyUsage).toHaveBeenCalledWith('2026-04-01')
    expect(Array.isArray(result)).toBe(true)
  })

  it('reads raw events via getEvents', async () => {
    await invoke(registry, 'token-usage:events', null)
    expect(getEvents).toHaveBeenCalledWith(null)
  })
})
