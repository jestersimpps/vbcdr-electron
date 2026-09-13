import { describe, it, expect } from 'vitest'
import { CompanionLineFeed, isNoiseLine, normalizeBufferLine } from './companion-buffer-lines'

describe('normalizeBufferLine', () => {
  it('strips ansi colour codes', () => {
    expect(normalizeBufferLine('\x1b[31mExit code 1\x1b[0m')).toBe('Exit code 1')
  })

  it('strips the prompt gutter and box drawing padding', () => {
    expect(normalizeBufferLine('│  221 passed  │')).toBe('221 passed')
    expect(normalizeBufferLine('❯ npm test')).toBe('npm test')
  })
})

describe('isNoiseLine', () => {
  const noise = [
    '⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · 117983 tokens',
    '✻ Working… (1m 23s · ↓ 5.1k tokens)',
    '──────────────────────────────────────',
    '❯'
  ]

  for (const line of noise) {
    it(`rejects spinner chrome: ${line.slice(0, 32)}`, () => {
      expect(isNoiseLine(line)).toBe(true)
    })
  }

  it('keeps real output that happens to sit near the status bar', () => {
    expect(isNoiseLine('221 passed')).toBe(false)
    expect(isNoiseLine('⏺ Bash(npm test)')).toBe(false)
  })
})

describe('CompanionLineFeed', () => {
  it('returns each line only the first time it is scanned', () => {
    const feed = new CompanionLineFeed()
    expect(feed.push('t1', ['⏺ Bash(npm test)'])).toEqual(['⏺ Bash(npm test)'])
    expect(feed.push('t1', ['⏺ Bash(npm test)'])).toEqual([])
  })

  it('surfaces a new line appended below lines it already saw', () => {
    const feed = new CompanionLineFeed()
    feed.push('t1', ['⏺ Bash(npm test)'])
    expect(feed.push('t1', ['⏺ Bash(npm test)', '221 passed'])).toEqual(['221 passed'])
  })

  it('filters spinner repaints out of the fresh lines', () => {
    const feed = new CompanionLineFeed()
    expect(feed.push('t1', ['✻ Working… (1m 23s · ↓ 5.1k tokens)', 'Exit code 1'])).toEqual([
      'Exit code 1'
    ])
  })

  it('drops blank and near-empty rows', () => {
    const feed = new CompanionLineFeed()
    expect(feed.push('t1', ['', '   ', 'ok'])).toEqual([])
  })

  it('tracks tabs independently so two agents do not mask each other', () => {
    const feed = new CompanionLineFeed()
    feed.push('t1', ['Exit code 1'])
    expect(feed.push('t2', ['Exit code 1'])).toEqual(['Exit code 1'])
  })

  it('forgets a tab on request', () => {
    const feed = new CompanionLineFeed()
    feed.push('t1', ['Exit code 1'])
    feed.forget('t1')
    expect(feed.push('t1', ['Exit code 1'])).toEqual(['Exit code 1'])
  })

  it('lets a long-past line resurface once it falls out of the window', () => {
    const feed = new CompanionLineFeed()
    feed.push('t1', ['first line here'])
    for (let i = 0; i < 420; i++) feed.push('t1', [`filler line ${i}`])
    expect(feed.push('t1', ['first line here'])).toEqual(['first line here'])
  })
})
