import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sweepScrollback = vi.fn(() => 0)

vi.mock('@main/services/terminal-scrollback', () => ({ sweepScrollback }))

let mod: typeof import('./scrollback-sweeper')

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  sweepScrollback.mockClear()
  mod = await import('./scrollback-sweeper')
})

afterEach(() => {
  mod.stopScrollbackSweeps()
  vi.useRealTimers()
})

describe('scrollback-sweeper', () => {
  it('sweeps immediately on start so a short-lived session still gets cleaned', () => {
    mod.startScrollbackSweeps()
    expect(sweepScrollback).toHaveBeenCalledTimes(1)
  })

  it('sweeps once per day while the app stays open', () => {
    mod.startScrollbackSweeps()
    vi.advanceTimersByTime(mod.SWEEP_INTERVAL_MS * 3)
    expect(sweepScrollback).toHaveBeenCalledTimes(4)
  })

  it('does not start a second timer when already running', () => {
    mod.startScrollbackSweeps()
    mod.startScrollbackSweeps()
    sweepScrollback.mockClear()
    vi.advanceTimersByTime(mod.SWEEP_INTERVAL_MS)
    expect(sweepScrollback).toHaveBeenCalledTimes(1)
  })

  it('stops sweeping after stop', () => {
    mod.startScrollbackSweeps()
    mod.stopScrollbackSweeps()
    sweepScrollback.mockClear()
    vi.advanceTimersByTime(mod.SWEEP_INTERVAL_MS * 2)
    expect(sweepScrollback).not.toHaveBeenCalled()
  })

  it('can be restarted after stopping', () => {
    mod.startScrollbackSweeps()
    mod.stopScrollbackSweeps()
    sweepScrollback.mockClear()
    mod.startScrollbackSweeps()
    expect(sweepScrollback).toHaveBeenCalledTimes(1)
  })

  it('stop is safe to call when never started', () => {
    expect(() => mod.stopScrollbackSweeps()).not.toThrow()
  })
})
