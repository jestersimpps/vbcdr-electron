import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const recordActivity = vi.fn()
const getSessions = vi.fn(() => [])
const getAllSessions = vi.fn(() => [])

vi.mock('@main/services/activity-service', () => ({
  recordActivity: (...args: unknown[]) => recordActivity(...args),
  getSessions: (...args: unknown[]) => getSessions(...args),
  getAllSessions: (...args: unknown[]) => getAllSessions(...args)
}))

let registry: IpcRegistry

vi.mock('electron', () => ({
  ipcMain: { handle: (..._args: unknown[]) => undefined }
}))

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  const ipcMock = makeIpcMainMock(registry)
  vi.doMock('electron', () => ({ ipcMain: ipcMock }))
  recordActivity.mockClear()
  getSessions.mockReset()
  getSessions.mockReturnValue([])
  getAllSessions.mockReset()
  getAllSessions.mockReturnValue([])
  const { registerActivityHandlers } = await import('./activity')
  registerActivityHandlers()
})

afterEach(() => {
  vi.doUnmock('electron')
})

describe('activity ipc', () => {
  it('records activity by forwarding to recordActivity', async () => {
    await invoke(registry, 'activity:record', 'p1', 'i')
    expect(recordActivity).toHaveBeenCalledWith('p1', 'i')
  })

  it('returns sessions from getSessions including idleMinutes', async () => {
    getSessions.mockReturnValueOnce([{ projectId: 'p1', start: 0, end: 1, durationMs: 1, inputCount: 1, outputCount: 0 }])
    const result = await invoke(registry, 'activity:sessions', 'p1', null, 7)
    expect(getSessions).toHaveBeenCalledWith('p1', null, 7)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns aggregated sessions from getAllSessions', async () => {
    await invoke(registry, 'activity:all-sessions', '2026-01-01', 5)
    expect(getAllSessions).toHaveBeenCalledWith('2026-01-01', 5)
  })

  it('passes sinceIso=null through unchanged', async () => {
    await invoke(registry, 'activity:all-sessions', null)
    expect(getAllSessions).toHaveBeenCalledWith(null, undefined)
  })
})
