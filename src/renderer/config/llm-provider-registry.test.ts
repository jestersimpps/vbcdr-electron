import { describe, it, expect } from 'vitest'
import {
  capabilitiesFor,
  clearContextCommandFor,
  isLlmProviderId,
  providerIdForCommand,
  resolveStartupCommand,
  SELECTABLE_LLM_PROVIDERS
} from './llm-provider-registry'

describe('providerIdForCommand', () => {
  it('maps bare binaries to their provider', () => {
    expect(providerIdForCommand('claude')).toBe('claude')
    expect(providerIdForCommand('codex')).toBe('codex')
  })

  it('treats a known binary with flags as custom so the flags survive', () => {
    expect(providerIdForCommand('claude --resume')).toBe('custom')
    expect(providerIdForCommand('codex exec')).toBe('custom')
  })

  it('treats unknown binaries as custom', () => {
    expect(providerIdForCommand('gemini')).toBe('custom')
    expect(providerIdForCommand('./my-wrapper.sh')).toBe('custom')
  })

  it('falls back to the default for blank input', () => {
    expect(providerIdForCommand('')).toBe('claude')
    expect(providerIdForCommand('   ')).toBe('claude')
  })

  it('ignores surrounding whitespace', () => {
    expect(providerIdForCommand('  codex  ')).toBe('codex')
  })
})

describe('resolveStartupCommand', () => {
  it('uses the registry command for known providers', () => {
    expect(resolveStartupCommand('claude', '')).toBe('claude')
    expect(resolveStartupCommand('codex', 'ignored')).toBe('codex')
  })

  it('uses the custom command for the custom provider', () => {
    expect(resolveStartupCommand('custom', 'claude --resume')).toBe('claude --resume')
  })

  it('returns empty for a blank custom command', () => {
    expect(resolveStartupCommand('custom', '   ')).toBe('')
  })
})

describe('capabilitiesFor', () => {
  it('grants claude the full feature set', () => {
    const caps = capabilitiesFor('claude')
    expect(caps.sessions).toBe(true)
    expect(caps.mcp).toBe(true)
    expect(caps.skills).toBe(true)
    expect(caps.permissions).toBe(true)
  })

  it('withholds claude-specific features from codex', () => {
    const caps = capabilitiesFor('codex')
    expect(caps.sessions).toBe(false)
    expect(caps.mcp).toBe(false)
    expect(caps.skills).toBe(false)
    expect(caps.permissions).toBe(false)
  })

  it('does not share capability objects between providers', () => {
    expect(capabilitiesFor('codex')).not.toBe(capabilitiesFor('custom'))
  })
})

describe('clearContextCommandFor', () => {
  it('returns the slash command for claude', () => {
    expect(clearContextCommandFor('claude')).toBe('/clear')
  })

  it('returns null for providers without a known clear command', () => {
    expect(clearContextCommandFor('codex')).toBeNull()
    expect(clearContextCommandFor('custom')).toBeNull()
  })
})

describe('isLlmProviderId', () => {
  it('accepts known ids and rejects anything else', () => {
    expect(isLlmProviderId('claude')).toBe(true)
    expect(isLlmProviderId('codex')).toBe(true)
    expect(isLlmProviderId('custom')).toBe(true)
    expect(isLlmProviderId('gemini')).toBe(false)
    expect(isLlmProviderId(undefined)).toBe(false)
  })
})

describe('SELECTABLE_LLM_PROVIDERS', () => {
  it('offers claude, codex and an escape hatch', () => {
    expect(SELECTABLE_LLM_PROVIDERS.map((p) => p.id)).toEqual(['claude', 'codex', 'custom'])
  })
})
