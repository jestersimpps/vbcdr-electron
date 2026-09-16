import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalStore } from '@/stores/terminal-store'

const mockGetInstance = vi.fn()

vi.mock('@/components/terminal/TerminalInstance', () => ({
  getTerminalInstance: (tabId: string) => mockGetInstance(tabId)
}))

const LLM_TAB = { id: 'tab-1', title: 'Claude', projectId: 'p1', cwd: '/p', initialCommand: 'claude' }

function seedStore(overrides: Partial<ReturnType<typeof useTerminalStore.getState>> = {}): void {
  useTerminalStore.setState({
    tabs: [LLM_TAB],
    tabStatuses: {},
    promptDetectedTabIds: {},
    ...overrides
  })
}

function liveEntry(): { terminal: { paste: ReturnType<typeof vi.fn> }; lastKeyAt: number } {
  return { terminal: { paste: vi.fn() }, lastKeyAt: 0 }
}

describe('send-to-terminal', () => {
  const writeSpy = window.api.terminal.write as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockGetInstance.mockReset()
    writeSpy.mockClear()
    seedStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when the terminal instance is missing', async () => {
    mockGetInstance.mockReturnValue(undefined)
    const { sendToTerminalViaPty } = await import('./send-to-terminal')
    sendToTerminalViaPty('missing-tab', 'hello')
    vi.advanceTimersByTime(500)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('pastes text immediately and writes a CR after the debounce', async () => {
    const entry = liveEntry()
    mockGetInstance.mockReturnValue(entry)
    const { sendToTerminalViaPty } = await import('./send-to-terminal')

    sendToTerminalViaPty('tab-1', 'echo hi')
    expect(entry.terminal.paste).toHaveBeenCalledWith('echo hi')
    expect(writeSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(99)
    expect(writeSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(writeSpy).toHaveBeenCalledWith('tab-1', '\r')
  })

  it('re-sends a CR while the tab stays idle, up to five times', async () => {
    mockGetInstance.mockReturnValue(liveEntry())
    const { sendToTerminalViaPty } = await import('./send-to-terminal')

    sendToTerminalViaPty('tab-1', 'plan it')
    vi.advanceTimersByTime(100)
    expect(writeSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(4000)
    expect(writeSpy).toHaveBeenCalledTimes(2)
    expect(writeSpy).toHaveBeenLastCalledWith('tab-1', '\r')

    vi.advanceTimersByTime(4000 * 10)
    expect(writeSpy).toHaveBeenCalledTimes(6)
  })

  it('stops retrying once the tab goes busy', async () => {
    mockGetInstance.mockReturnValue(liveEntry())
    const { sendToTerminalViaPty } = await import('./send-to-terminal')

    sendToTerminalViaPty('tab-1', 'plan it')
    vi.advanceTimersByTime(100)
    useTerminalStore.setState({ tabStatuses: { 'tab-1': 'busy' } })

    vi.advanceTimersByTime(4000 * 10)
    expect(writeSpy).toHaveBeenCalledTimes(1)
  })

  it('does not retry into a detected prompt, a plain shell, or a disposed terminal', async () => {
    mockGetInstance.mockReturnValue(liveEntry())
    const { sendToTerminalViaPty } = await import('./send-to-terminal')

    seedStore({ promptDetectedTabIds: { 'tab-1': true } })
    sendToTerminalViaPty('tab-1', 'a')
    vi.advanceTimersByTime(100 + 4000 * 10)
    expect(writeSpy).toHaveBeenCalledTimes(1)

    writeSpy.mockClear()
    seedStore({ tabs: [{ ...LLM_TAB, initialCommand: undefined }] })
    sendToTerminalViaPty('tab-1', 'b')
    vi.advanceTimersByTime(100 + 4000 * 10)
    expect(writeSpy).toHaveBeenCalledTimes(1)

    writeSpy.mockClear()
    seedStore()
    sendToTerminalViaPty('tab-1', 'c')
    vi.advanceTimersByTime(100)
    mockGetInstance.mockReturnValue(undefined)
    vi.advanceTimersByTime(4000 * 10)
    expect(writeSpy).toHaveBeenCalledTimes(1)
  })

  it('stops retrying once the person types in that terminal', async () => {
    const entry = liveEntry()
    mockGetInstance.mockReturnValue(entry)
    const { sendToTerminalViaPty } = await import('./send-to-terminal')

    sendToTerminalViaPty('tab-1', 'plan it')
    vi.advanceTimersByTime(100 + 4000)
    expect(writeSpy).toHaveBeenCalledTimes(2)

    entry.lastKeyAt = Date.now()
    vi.advanceTimersByTime(4000 * 10)
    expect(writeSpy).toHaveBeenCalledTimes(2)
  })
})
