import { describe, it, expect } from 'vitest'
import { stripAnsi, cleanLine, parseAgentAction } from './agent-protocol'
import { providerDefinition } from '@/config/llm-provider-registry'

// Captured from a real `codex` 0.147.0 PTY session on 2026-08-09 (node-pty,
// xterm-256color, 120x30). Codex drives the screen with absolute cursor moves and
// enables the kitty keyboard protocol, which is what makes it a good adversarial
// case for the parser.
const CODEX_KITTY_ENABLE = '\x1b[>4;0m\x1b[>7u'
const CODEX_BANNER_FRAGMENT =
  ';2H\x1b[0m\x1b[49m\x1b[K\x1b[30;2H\x1b[0m\x1b[49m\x1b[K\x1b[1;3HWelcome\x1b[1;11Hto\x1b[1;14H\x1b[1mCod'

describe('stripAnsi against real Codex output', () => {
  it('removes kitty keyboard protocol sequences completely', () => {
    // The private parameter byte ">" is the trap: a CSI pattern without it
    // leaves "4;0m" and "7u" behind as visible garbage.
    expect(stripAnsi(CODEX_KITTY_ENABLE)).toBe('')
    expect(stripAnsi(`${CODEX_KITTY_ENABLE}Welcome to Codex`)).toBe('Welcome to Codex')
  })

  it('removes absolute cursor positioning and erase sequences', () => {
    const cleaned = stripAnsi(CODEX_BANNER_FRAGMENT)
    expect(cleaned).not.toMatch(/\x1b/)
    expect(cleaned).not.toMatch(/\d+;\d+H/)
    expect(cleaned).toContain('Welcome')
  })

  it('leaves no bare escape characters in real captured output', () => {
    expect(stripAnsi(CODEX_BANNER_FRAGMENT + CODEX_KITTY_ENABLE)).not.toMatch(/\x1b/)
  })

  it('still handles plain SGR colour the same as before', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello')
  })
})

describe('JSON extraction survives Codex screen-drawing', () => {
  it('recovers an action wrapped in kitty + SGR sequences', () => {
    const line = `${CODEX_KITTY_ENABLE}\x1b[1m{"action":"show-git"}\x1b[0m`
    expect(parseAgentAction(line)).toEqual({ action: 'show-git' })
  })

  it('recovers an action from a cursor-positioned line', () => {
    const line = '\x1b[12;3H\x1b[K{"action":"switch-project","target":"petsitters"}'
    expect(parseAgentAction(line)).toEqual({
      action: 'switch-project',
      target: 'petsitters'
    })
  })

  it('cleanLine yields no leftover control-sequence residue', () => {
    expect(cleanLine(`${CODEX_KITTY_ENABLE}  {"action":"save-file"}  `)).toBe(
      '{"action":"save-file"}'
    )
  })
})

describe('Codex readiness detection', () => {
  it('the banner is detectable after stripping, for readyPattern use', () => {
    const cleaned = stripAnsi(CODEX_BANNER_FRAGMENT)
    expect(/Welcome/.test(cleaned)).toBe(true)
  })

  it('codex ships voiceAgent:false until an authenticated transcript exists', () => {
    // Verified 2026-08-09: codex 0.147.0 installs and starts, but `codex login
    // status` reports "Not logged in", so its JSON-contract compliance is still
    // unproven. The flag stays false so the translator picker omits it.
    expect(providerDefinition('codex').voiceAgent).toBe(false)
  })
})
