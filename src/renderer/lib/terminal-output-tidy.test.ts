import { describe, expect, it } from 'vitest'
import { findFileMatches, stripAnsi, tidyChunk } from './terminal-output-tidy'

describe('tidyChunk', () => {
  it('passes plain content through untouched', () => {
    const input = 'hello world\r\n'
    expect(tidyChunk(input)).toBe(input)
  })

  it('passes single-line chunks (no newline) through untouched', () => {
    expect(tidyChunk('● Read(file.ts)')).toBe('● Read(file.ts)')
  })

  it('collapses runs of 4+ blank lines down to 3 newlines', () => {
    const input = 'a\n\n\n\n\nb'
    expect(tidyChunk(input)).toBe('a\r\n\r\n\r\nb')
  })

  it('leaves box-drawing characters alone (TUIs draw their own frames)', () => {
    const input = '╭────╮\n│ hi │\n╰────╯\n'
    expect(tidyChunk(input)).toBe(input)
  })
})

describe('stripAnsi', () => {
  it('removes basic CSI sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
  })
})

describe('findFileMatches', () => {
  it('detects a bare file path', () => {
    const matches = findFileMatches('see src/components/Foo.tsx for details')
    expect(matches).toHaveLength(1)
    expect(matches[0].rawPath).toBe('src/components/Foo.tsx')
    expect(matches[0].line).toBeNull()
  })

  it('detects path with line number', () => {
    const matches = findFileMatches('error at src/foo.ts:42')
    expect(matches).toHaveLength(1)
    expect(matches[0].rawPath).toBe('src/foo.ts')
    expect(matches[0].line).toBe(42)
  })

  it('detects path with line and column', () => {
    const matches = findFileMatches('src/foo.ts:42:7 something')
    expect(matches).toHaveLength(1)
    expect(matches[0].line).toBe(42)
    expect(matches[0].column).toBe(7)
  })

  it('returns offsets that point at the path in the original string', () => {
    const line = 'click src/foo.ts:42 here'
    const [m] = findFileMatches(line)
    expect(line.slice(m.start, m.end)).toBe('src/foo.ts:42')
  })

  it('detects multiple paths in one line', () => {
    const matches = findFileMatches('moved utils.ts to lib/utils.ts')
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('ignores strings that look like file paths but lack an allowed extension', () => {
    expect(findFileMatches('something/random/no-ext here')).toHaveLength(0)
  })

  it('detects paths inside parentheses (Claude tool output)', () => {
    const matches = findFileMatches('● Read(src/foo.ts)')
    expect(matches).toHaveLength(1)
    expect(matches[0].rawPath).toBe('src/foo.ts')
  })

  it('detects relative paths beginning with ./', () => {
    const matches = findFileMatches('opening ./package.json')
    expect(matches).toHaveLength(1)
    expect(matches[0].rawPath).toBe('./package.json')
  })
})
