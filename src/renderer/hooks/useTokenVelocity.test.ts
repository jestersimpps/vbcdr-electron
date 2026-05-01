import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTokenVelocity } from './useTokenVelocity'
import { useTerminalStore } from '@/stores/terminal-store'

describe('useTokenVelocity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useTerminalStore.setState({ tokenUsagePerTab: {} } as never)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('returns empty samples and zero rate when no tabId is provided', () => {
    const { result } = renderHook(() => useTokenVelocity(null))
    expect(result.current.samples).toEqual([])
    expect(result.current.tokensPerMinute).toBe(0)
    expect(result.current.velocityPerSample).toEqual([])
  })

  it('returns zero rate when the tab has no token data yet', () => {
    const { result } = renderHook(() => useTokenVelocity('tab-1'))
    expect(result.current.samples).toEqual([])
    expect(result.current.tokensPerMinute).toBe(0)
  })

  it('seeds two samples on the first tick and computes a non-zero rate', () => {
    useTerminalStore.setState({ tokenUsagePerTab: { 't1': 100 } } as never)
    const { result } = renderHook(() => useTokenVelocity('t1'))

    expect(result.current.samples).toHaveLength(2)
    expect(result.current.samples[0].tokens).toBe(100)
    expect(result.current.samples[1].tokens).toBe(100)
    expect(result.current.tokensPerMinute).toBe(0)
  })

  it('resets samples when the tabId changes', () => {
    useTerminalStore.setState({ tokenUsagePerTab: { 'a': 100, 'b': 999 } } as never)
    const { result, rerender } = renderHook(({ id }) => useTokenVelocity(id), {
      initialProps: { id: 'a' as string | null }
    })
    expect(result.current.samples[0]?.tokens).toBe(100)

    rerender({ id: 'b' })
    expect(result.current.samples[0]?.tokens).toBe(999)
  })
})
