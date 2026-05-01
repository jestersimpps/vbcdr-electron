import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetInstance = vi.fn()

vi.mock('@/components/terminal/TerminalInstance', () => ({
  getTerminalInstance: (tabId: string) => mockGetInstance(tabId)
}))

describe('send-to-terminal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetInstance.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when the terminal instance is missing', async () => {
    mockGetInstance.mockReturnValue(undefined)
    const writeSpy = window.api.terminal.write as ReturnType<typeof vi.fn>
    writeSpy.mockClear()
    const { sendToTerminalViaPty } = await import('./send-to-terminal')
    sendToTerminalViaPty('missing-tab', 'hello')
    vi.advanceTimersByTime(500)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('pastes text immediately and writes a CR after the debounce', async () => {
    const paste = vi.fn()
    mockGetInstance.mockReturnValue({ terminal: { paste } })
    const writeSpy = window.api.terminal.write as ReturnType<typeof vi.fn>
    writeSpy.mockClear()
    const { sendToTerminalViaPty } = await import('./send-to-terminal')

    sendToTerminalViaPty('tab-1', 'echo hi')
    expect(paste).toHaveBeenCalledWith('echo hi')
    expect(writeSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(99)
    expect(writeSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(writeSpy).toHaveBeenCalledWith('tab-1', '\r')
  })
})
