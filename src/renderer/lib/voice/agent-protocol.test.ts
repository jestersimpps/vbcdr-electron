import { describe, it, expect } from 'vitest'
import {
  AgentLineBuffer,
  buildProtocolPreamble,
  cleanLine,
  extractJsonObject,
  isKnownAction,
  parseAgentAction,
  stripAnsi
} from './agent-protocol'

const ESC = ''

describe('stripAnsi', () => {
  it('removes colour codes', () => {
    expect(stripAnsi(`${ESC}[32mhello${ESC}[0m`)).toBe('hello')
  })

  it('removes cursor movement codes', () => {
    expect(stripAnsi(`${ESC}[2K${ESC}[1Gtext`)).toBe('text')
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi('{"action":"show-git"}')).toBe('{"action":"show-git"}')
  })
})

describe('cleanLine', () => {
  it('strips box drawing decoration used by CLI frames', () => {
    expect(cleanLine('│ {"action":"show-git"} │')).toBe('{"action":"show-git"}')
  })

  it('strips carriage returns and surrounding whitespace', () => {
    expect(cleanLine('  {"action":"show-git"}\r  ')).toBe('{"action":"show-git"}')
  })
})

describe('extractJsonObject', () => {
  it('parses a bare JSON line', () => {
    expect(extractJsonObject('{"action":"show-git"}')).toEqual({ action: 'show-git' })
  })

  it('finds JSON embedded in prose', () => {
    expect(extractJsonObject('Sure! {"action":"show-git"} hope that helps')).toEqual({
      action: 'show-git'
    })
  })

  it('finds JSON inside a markdown fence', () => {
    expect(extractJsonObject('```json {"action":"show-git"} ```')).toEqual({
      action: 'show-git'
    })
  })

  it('finds JSON wrapped in ANSI colour and box drawing', () => {
    expect(extractJsonObject(`│ ${ESC}[36m{"action":"set-theme","target":"dracula"}${ESC}[0m │`)).toEqual(
      { action: 'set-theme', target: 'dracula' }
    )
  })

  it('returns null for non-JSON output', () => {
    expect(extractJsonObject('Welcome to Claude Code!')).toBeNull()
    expect(extractJsonObject('')).toBeNull()
    expect(extractJsonObject('{ broken json')).toBeNull()
  })
})

describe('parseAgentAction', () => {
  it('parses action, target and say', () => {
    expect(parseAgentAction('{"action":"switch-project","target":"petsitters","say":"ok"}')).toEqual(
      { action: 'switch-project', target: 'petsitters', say: 'ok' }
    )
  })

  it('omits blank optional fields', () => {
    expect(parseAgentAction('{"action":"show-git","target":"","say":"  "}')).toEqual({
      action: 'show-git'
    })
  })

  it('rejects a missing or non-string action', () => {
    expect(parseAgentAction('{"target":"x"}')).toBeNull()
    expect(parseAgentAction('{"action":123}')).toBeNull()
    expect(parseAgentAction('{"action":"  "}')).toBeNull()
  })

  it('rejects primitives and objectless output', () => {
    expect(parseAgentAction('"show-git"')).toBeNull()
    expect(parseAgentAction('[1, 2, 3]')).toBeNull()
  })

  it('recovers the object from an array-wrapped reply', () => {
    expect(parseAgentAction('[{"action":"show-git"}]')).toEqual({ action: 'show-git' })
  })

  it('ignores unknown extra fields rather than failing', () => {
    expect(parseAgentAction('{"action":"show-git","needsConfirm":false,"junk":1}')).toEqual({
      action: 'show-git'
    })
  })
})

describe('isKnownAction', () => {
  it('accepts registered actions and dictate', () => {
    expect(isKnownAction('show-git')).toBe(true)
    expect(isKnownAction('switch-project')).toBe(true)
    expect(isKnownAction('dictate')).toBe(true)
  })

  it('rejects hallucinated actions', () => {
    expect(isKnownAction('rm-rf')).toBe(false)
    expect(isKnownAction('delete_everything')).toBe(false)
  })
})

describe('AgentLineBuffer', () => {
  it('emits only complete lines', () => {
    const buf = new AgentLineBuffer()
    expect(buf.push('{"action":')).toEqual([])
    expect(buf.push('"show-git"}\n')).toEqual(['{"action":"show-git"}'])
  })

  it('handles several lines in one chunk', () => {
    const buf = new AgentLineBuffer()
    expect(buf.push('a\nb\nc')).toEqual(['a', 'b'])
    expect(buf.flush()).toBe('c')
  })

  it('reassembles JSON split across writes', () => {
    const buf = new AgentLineBuffer()
    buf.push('{"action":"set-theme",')
    buf.push('"target":"nord"}')
    const [line] = buf.push('\n')
    expect(parseAgentAction(line)).toEqual({ action: 'set-theme', target: 'nord' })
  })
})

describe('buildProtocolPreamble', () => {
  it('lists real registered actions', () => {
    const preamble = buildProtocolPreamble()
    expect(preamble).toContain('switch-project')
    expect(preamble).toContain('dictate')
  })

  it('forbids fences and explanation', () => {
    const preamble = buildProtocolPreamble()
    expect(preamble).toContain('never use markdown fences')
    expect(preamble).toContain('ONE line of JSON')
  })

  it('is a SINGLE line', () => {
    // The PTY submits on every "\n", so a multi-line preamble is delivered as N
    // separate prompts and the agent answers each one.
    expect(buildProtocolPreamble()).not.toContain('\n')
  })

  it('does not read as a request, and asks for an explicit acknowledgement', () => {
    // An earlier version ended with a filled-in example and the agent replied with
    // {"action":"dictate","target":"<the text verbatim>"} before any speech existed.
    const preamble = buildProtocolPreamble()
    expect(preamble).toContain('not a request')
    expect(preamble).toMatch(/READY/)
    expect(preamble).not.toContain('<the text verbatim>')
  })
})
