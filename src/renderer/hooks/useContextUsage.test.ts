import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useContextUsage } from './useContextUsage'
import { useTerminalStore } from '@/stores/terminal-store'
import { isTranscriptDriven, unmarkTranscriptDriven } from '@/lib/transcript-driven-tabs'

const flush = (): Promise<void> => act(async () => {})

describe('useContextUsage', () => {
  beforeEach(() => {
    useTerminalStore.setState({ tokenUsagePerTab: {} } as never)
    unmarkTranscriptDriven('t1')
    vi.mocked(window.api.tokenUsage.context).mockReset().mockResolvedValue(null)
    vi.mocked(window.api.tokenUsage.record).mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('does not poll without a tabId or cwd', async () => {
    renderHook(() => useContextUsage(null, 'p1', '/cwd'))
    renderHook(() => useContextUsage('t1', 'p1', null))
    await flush()
    expect(window.api.tokenUsage.context).not.toHaveBeenCalled()
  })

  it('polls transcript usage scoped to the tab and stores the token count', async () => {
    vi.mocked(window.api.tokenUsage.context).mockResolvedValue({
      contextTokens: 1234,
      model: 'claude-sonnet-4-6',
      contextCap: 200_000
    })
    renderHook(() => useContextUsage('t1', 'p1', '/cwd'))
    await flush()

    expect(window.api.tokenUsage.context).toHaveBeenCalledWith('/cwd', 't1')
    expect(useTerminalStore.getState().tokenUsagePerTab.t1).toBe(1234)
    expect(window.api.tokenUsage.record).toHaveBeenCalledWith('t1', 'p1', 1234)
    expect(isTranscriptDriven('t1')).toBe(true)
  })

  it('leaves the store untouched when no transcript usage is available', async () => {
    renderHook(() => useContextUsage('t1', 'p1', '/cwd'))
    await flush()
    expect(useTerminalStore.getState().tokenUsagePerTab.t1).toBeUndefined()
    expect(window.api.tokenUsage.record).not.toHaveBeenCalled()
    expect(isTranscriptDriven('t1')).toBe(false)
  })

  it('does not record per project without a projectId', async () => {
    vi.mocked(window.api.tokenUsage.context).mockResolvedValue({
      contextTokens: 50,
      model: null,
      contextCap: 200_000
    })
    renderHook(() => useContextUsage('t1', null, '/cwd'))
    await flush()
    expect(useTerminalStore.getState().tokenUsagePerTab.t1).toBe(50)
    expect(window.api.tokenUsage.record).not.toHaveBeenCalled()
  })

  it('keeps polling on an interval and stops after unmount', async () => {
    vi.useFakeTimers()
    vi.mocked(window.api.tokenUsage.context).mockResolvedValue({
      contextTokens: 10,
      model: null,
      contextCap: 200_000
    })
    const { unmount } = renderHook(() => useContextUsage('t1', 'p1', '/cwd'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(vi.mocked(window.api.tokenUsage.context).mock.calls.length).toBeGreaterThanOrEqual(2)

    unmount()
    const callsAfterUnmount = vi.mocked(window.api.tokenUsage.context).mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(vi.mocked(window.api.tokenUsage.context).mock.calls.length).toBe(callsAfterUnmount)
  })
})
