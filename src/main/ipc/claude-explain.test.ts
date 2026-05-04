import { describe, expect, it } from 'vitest'
import { parseClaudeJsonEnvelope } from './claude-explain'

describe('parseClaudeJsonEnvelope', () => {
  it('extracts structured_output from a real claude -p result event', () => {
    const real = JSON.stringify([
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [{ type: 'tool_use' }] } },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        structured_output: {
          files: [
            {
              path: 'src/foo.ts',
              summary: 'Adds zero-shortcut branches.',
              comments: [
                { line: 2, side: 'new', text: 'Early returns when one operand is 0.' }
              ]
            }
          ]
        }
      }
    ])
    const out = parseClaudeJsonEnvelope(real)
    expect(out.files).toHaveLength(1)
    expect(out.files[0].path).toBe('src/foo.ts')
    expect(out.files[0].comments[0].line).toBe(2)
    expect(out.files[0].comments[0].side).toBe('new')
  })

  it('falls back to result string when structured_output is missing', () => {
    const stringResult = JSON.stringify([
      { type: 'system' },
      {
        type: 'result',
        is_error: false,
        result: JSON.stringify({
          files: [{ path: 'x.ts', comments: [{ line: 1, side: 'new', text: 'note' }] }]
        })
      }
    ])
    const out = parseClaudeJsonEnvelope(stringResult)
    expect(out.files[0].path).toBe('x.ts')
  })

  it('throws when claude reports an error', () => {
    const errorEnv = JSON.stringify([
      { type: 'result', is_error: true, result: 'rate limited' }
    ])
    expect(() => parseClaudeJsonEnvelope(errorEnv)).toThrow(/rate limited/)
  })

  it('throws on empty output', () => {
    expect(() => parseClaudeJsonEnvelope('')).toThrow(/empty/)
  })

  it('throws on malformed JSON', () => {
    expect(() => parseClaudeJsonEnvelope('not json')).toThrow(/valid JSON/)
  })

  it('handles a single object envelope (legacy non-array form)', () => {
    const single = JSON.stringify({
      type: 'result',
      is_error: false,
      structured_output: {
        files: [{ path: 'a.ts', comments: [] }]
      }
    })
    const out = parseClaudeJsonEnvelope(single)
    expect(out.files[0].path).toBe('a.ts')
  })
})
