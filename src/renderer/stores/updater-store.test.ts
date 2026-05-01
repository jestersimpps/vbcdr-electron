import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdaterStore } from './updater-store'

interface UpdaterApiMock {
  getStatus: ReturnType<typeof vi.fn>
  check: ReturnType<typeof vi.fn>
  install: ReturnType<typeof vi.fn>
  onStatus: ReturnType<typeof vi.fn>
}

let unsub: ReturnType<typeof vi.fn>
let onStatusCallback: ((status: { state: string; version?: string; percent?: number }) => void) | null

beforeEach(() => {
  unsub = vi.fn()
  onStatusCallback = null
  const updater: UpdaterApiMock = {
    getStatus: vi.fn(async () => ({ state: 'idle' as const })),
    check: vi.fn(),
    install: vi.fn(),
    onStatus: vi.fn((cb: (status: { state: string; version?: string; percent?: number }) => void) => {
      onStatusCallback = cb
      return unsub
    })
  }
  ;(window as unknown as { api: { updater: UpdaterApiMock } }).api = {
    ...(window as unknown as { api: Record<string, unknown> }).api,
    updater
  } as never
  useUpdaterStore.setState({ state: 'idle', version: undefined, percent: undefined, dismissed: false })
})

describe('updater-store', () => {
  it('init() seeds state from getStatus and registers an onStatus listener', async () => {
    const updater = (window as unknown as { api: { updater: UpdaterApiMock } }).api.updater
    updater.getStatus.mockResolvedValueOnce({ state: 'available', version: '1.2.0', percent: 0 })

    const off = useUpdaterStore.getState().init()
    await vi.waitFor(() => {
      expect(useUpdaterStore.getState().state).toBe('available')
    })
    expect(useUpdaterStore.getState().version).toBe('1.2.0')
    expect(updater.onStatus).toHaveBeenCalledTimes(1)
    expect(off).toBe(unsub)
  })

  it('onStatus updates state and clears the dismissed flag', async () => {
    useUpdaterStore.getState().init()
    useUpdaterStore.setState({ dismissed: true })
    expect(onStatusCallback).not.toBeNull()
    onStatusCallback!({ state: 'downloading', version: '2.0.0', percent: 42 })

    const s = useUpdaterStore.getState()
    expect(s.state).toBe('downloading')
    expect(s.version).toBe('2.0.0')
    expect(s.percent).toBe(42)
    expect(s.dismissed).toBe(false)
  })

  it('check() and install() forward to the updater api', () => {
    const updater = (window as unknown as { api: { updater: UpdaterApiMock } }).api.updater
    useUpdaterStore.getState().check()
    useUpdaterStore.getState().install()
    expect(updater.check).toHaveBeenCalledTimes(1)
    expect(updater.install).toHaveBeenCalledTimes(1)
  })

  it('dismiss() flips the dismissed flag without touching state', () => {
    useUpdaterStore.setState({ state: 'downloaded', version: '3.0.0' })
    useUpdaterStore.getState().dismiss()
    const s = useUpdaterStore.getState()
    expect(s.dismissed).toBe(true)
    expect(s.state).toBe('downloaded')
    expect(s.version).toBe('3.0.0')
  })
})
