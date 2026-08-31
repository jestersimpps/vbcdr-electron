import { describe, expect, it, vi } from 'vitest'

// TerminalInstance pulls in xterm, which needs a real DOM/canvas; the guard under
// test is pure, so stub the heavy imports and exercise it directly.
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))

// vi.mock calls above are hoisted, so a static import is safe here and avoids a
// top-level await (which this tsconfig's module target rejects).
import { shouldRefit } from './TerminalInstance'

describe('shouldRefit', () => {
  it('refits when the proposed grid differs from the current one', () => {
    expect(shouldRefit({ cols: 120, rows: 40 }, { cols: 80, rows: 24 })).toBe(true)
    expect(shouldRefit({ cols: 80, rows: 40 }, { cols: 80, rows: 24 })).toBe(true)
    expect(shouldRefit({ cols: 120, rows: 24 }, { cols: 80, rows: 24 })).toBe(true)
  })

  // The loop this guards: fit() mutates the DOM, the ResizeObserver watching that
  // DOM fires, and it schedules another fit. Returning false on an unchanged grid
  // is what stops the cycle.
  it('does NOT refit when the proposed grid is identical', () => {
    expect(shouldRefit({ cols: 80, rows: 24 }, { cols: 80, rows: 24 })).toBe(false)
  })

  it('does not refit when proposeDimensions returns nothing', () => {
    expect(shouldRefit(undefined, { cols: 80, rows: 24 })).toBe(false)
  })

  it('does not refit on zero or missing dimensions (detached / hidden element)', () => {
    expect(shouldRefit({ cols: 0, rows: 24 }, { cols: 80, rows: 24 })).toBe(false)
    expect(shouldRefit({ cols: 80, rows: 0 }, { cols: 80, rows: 24 })).toBe(false)
    expect(shouldRefit({ cols: 0, rows: 0 }, { cols: 80, rows: 24 })).toBe(false)
    expect(shouldRefit({}, { cols: 80, rows: 24 })).toBe(false)
    expect(shouldRefit({ cols: undefined, rows: undefined }, { cols: 80, rows: 24 })).toBe(false)
  })

  it('does not refit on non-finite dimensions', () => {
    expect(shouldRefit({ cols: NaN, rows: 24 }, { cols: 80, rows: 24 })).toBe(false)
    expect(shouldRefit({ cols: 80, rows: Infinity }, { cols: 80, rows: 24 })).toBe(false)
  })

  it('is stable: a settled terminal never asks for another fit', () => {
    const current = { cols: 100, rows: 30 }
    // Simulate the observer firing repeatedly after the grid has settled - every
    // pass must decline, otherwise the loop never terminates.
    for (let i = 0; i < 50; i++) {
      expect(shouldRefit({ cols: 100, rows: 30 }, current)).toBe(false)
    }
  })

  it('converges: one refit, then no further refits', () => {
    const terminal = { cols: 80, rows: 24 }
    const proposed = { cols: 120, rows: 40 }

    expect(shouldRefit(proposed, terminal)).toBe(true)
    // fit() would apply the proposed size:
    terminal.cols = proposed.cols
    terminal.rows = proposed.rows
    expect(shouldRefit(proposed, terminal)).toBe(false)
  })
})
