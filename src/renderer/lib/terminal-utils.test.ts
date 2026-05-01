import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetInstance = vi.fn()

vi.mock('@/components/terminal/TerminalInstance', () => ({
  getTerminalInstance: (tabId: string) => mockGetInstance(tabId)
}))

describe('terminal-utils sendToTerminalViaKeyboardEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetInstance.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when the terminal instance is missing', async () => {
    mockGetInstance.mockReturnValue(undefined)
    const { sendToTerminalViaKeyboardEvent } = await import('./terminal-utils')
    expect(() => {
      sendToTerminalViaKeyboardEvent('missing-tab', 'hello')
      vi.advanceTimersByTime(1000)
    }).not.toThrow()
  })

  it('pastes the text and dispatches Enter on the textarea after 500ms', async () => {
    const paste = vi.fn()
    const focus = vi.fn()
    const dispatchEvent = vi.fn().mockReturnValue(true)
    const textarea = { focus, dispatchEvent }
    mockGetInstance.mockReturnValue({ terminal: { paste, textarea } })

    const { sendToTerminalViaKeyboardEvent } = await import('./terminal-utils')
    sendToTerminalViaKeyboardEvent('tab-1', 'git status')
    expect(paste).toHaveBeenCalledWith('git status')
    expect(focus).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(focus).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const event = dispatchEvent.mock.calls[0][0] as KeyboardEvent
    expect(event).toBeInstanceOf(KeyboardEvent)
    expect(event.key).toBe('Enter')
    expect(event.code).toBe('Enter')
    expect(event.bubbles).toBe(true)
  })

  it('skips the keydown dispatch when textarea is missing', async () => {
    const paste = vi.fn()
    mockGetInstance.mockReturnValue({ terminal: { paste, textarea: null } })

    const { sendToTerminalViaKeyboardEvent } = await import('./terminal-utils')
    expect(() => {
      sendToTerminalViaKeyboardEvent('tab-1', 'noop')
      vi.advanceTimersByTime(500)
    }).not.toThrow()
    expect(paste).toHaveBeenCalledWith('noop')
  })
})
