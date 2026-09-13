import { describe, it, expect } from 'vitest'
import { CompanionMarkerScanner, parseMarkerBody, stripMarkers } from './companion-marker'

describe('parseMarkerBody', () => {
  it('splits gesture and text', () => {
    expect(parseMarkerBody('affirm|tests pass')).toEqual({ gesture: 'affirm', text: 'tests pass' })
  })

  it('accepts text with no gesture', () => {
    expect(parseMarkerBody('just talking')).toEqual({ gesture: null, text: 'just talking' })
  })

  it('rejects an unknown gesture name but keeps the text', () => {
    expect(parseMarkerBody('bogus|still here')).toEqual({ gesture: null, text: 'still here' })
  })

  it('returns null when nothing usable remains', () => {
    expect(parseMarkerBody('   ')).toBeNull()
  })

  it('strips control characters', () => {
    expect(parseMarkerBody('affirm|ab')?.text).toBe('ab')
  })

  it('caps very long text', () => {
    const parsed = parseMarkerBody('affirm|' + 'x'.repeat(500))
    expect(parsed?.text.length).toBe(120)
  })
})

describe('cursor-positioned output', () => {
  // Taken verbatim from captured scrollback: the TUI lays words out with CHA
  // column jumps, so stripping them outright used to fuse the whole line.
  const painted =
    "[TLDR]>thinkingAside|she\x1b[28Gwatches\x1b[36Gyour\x1b[41Gcursor\x1b[48Gnow,\x1b[53Ghope\x1b[58Gyou're<[TLDR]"

  it('keeps the words apart when the TUI positions them by column', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push(painted)[0].text).toBe("she watches your cursor now, hope you're")
  })

  it('handles cursor-forward moves as well as absolute columns', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push('[TLDR]>affirm|two\x1b[3Cwords<[TLDR]')[0].text).toBe('two words')
  })

  it('leaves text that already has real spaces alone', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push('[TLDR]>affirm|here you go<[TLDR]')[0].text).toBe('here you go')
  })

  it('does not introduce a gap from colour codes', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push('[TLDR]>affirm|\x1b[38;5;174mstill one line\x1b[39m<[TLDR]')[0].text).toBe(
      'still one line'
    )
  })
})

describe('CompanionMarkerScanner', () => {
  it('finds a marker in a single chunk', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push('noise [TLDR]>affirm|done<[TLDR] more')).toEqual([
      { gesture: 'affirm', text: 'done' }
    ])
  })

  it('reassembles a marker split across chunks', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push('work [TLDR]>wi')).toEqual([])
    expect(s.push('nce|build fai')).toEqual([])
    expect(s.push('led<[TLDR] tail')).toEqual([{ gesture: 'wince', text: 'build failed' }])
  })

  it('handles a marker split one character at a time', () => {
    const s = new CompanionMarkerScanner()
    const payload = '[TLDR]>perkUp|listening<[TLDR]'
    const out = payload.split('').flatMap((c) => s.push(c))
    expect(out).toEqual([{ gesture: 'perkUp', text: 'listening' }])
  })

  it('finds several markers in one chunk', () => {
    const s = new CompanionMarkerScanner()
    const out = s.push('[TLDR]>acknowledge|a<[TLDR] x [TLDR]>affirm|b<[TLDR]')
    expect(out).toEqual([
      { gesture: 'acknowledge', text: 'a' },
      { gesture: 'affirm', text: 'b' }
    ])
  })

  it('strips ansi before matching', () => {
    const s = new CompanionMarkerScanner()
    expect(s.push('[32m[TLDR]>affirm|green<[TLDR][0m')).toEqual([
      { gesture: 'affirm', text: 'green' }
    ])
  })

  it('does not re-emit an already consumed marker', () => {
    const s = new CompanionMarkerScanner()
    s.push('[TLDR]>affirm|once<[TLDR]')
    expect(s.push(' later output')).toEqual([])
  })

  it('drops an unterminated marker that grows too large', () => {
    const s = new CompanionMarkerScanner()
    s.push('[TLDR]>' + 'x'.repeat(5000))
    expect(s.push('done<[TLDR]')).toEqual([])
  })

  it('does not leak memory on plain output', () => {
    const s = new CompanionMarkerScanner()
    for (let i = 0; i < 100; i++) s.push('ordinary terminal line\n')
    expect(s.push('[TLDR]>affirm|ok<[TLDR]')).toEqual([{ gesture: 'affirm', text: 'ok' }])
  })
})

describe('stripMarkers', () => {
  it('removes markers from display text', () => {
    expect(stripMarkers('a [TLDR]>affirm|x<[TLDR] b')).toBe('a  b')
  })
})
