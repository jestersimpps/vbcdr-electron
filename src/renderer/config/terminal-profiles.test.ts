import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUILTIN_PROFILE_COLORS,
  DEFAULT_CUSTOM_PROFILE_COLORS,
  buildTerminalProfiles,
  defaultCustomProfiles,
  inferProviderId,
  isValidHexColor,
  sanitizeBuiltinProfileColors,
  sanitizeCustomProfiles,
  toTabProfileMeta
} from './terminal-profiles'

describe('inferProviderId', () => {
  it('recognises a known binary even with flags or a path', () => {
    expect(inferProviderId('claude')).toBe('claude')
    expect(inferProviderId('claude --model opus')).toBe('claude')
    expect(inferProviderId('/usr/local/bin/codex exec')).toBe('codex')
  })

  it('treats anything else as custom', () => {
    expect(inferProviderId('gemini')).toBe('custom')
    expect(inferProviderId('')).toBe('custom')
    expect(inferProviderId('claude-wrapper')).toBe('custom')
  })
})

describe('isValidHexColor', () => {
  it('accepts six-digit hex only', () => {
    expect(isValidHexColor('#d97757')).toBe(true)
    expect(isValidHexColor('#FFF')).toBe(false)
    expect(isValidHexColor('red')).toBe(false)
    expect(isValidHexColor(undefined)).toBe(false)
  })
})

describe('sanitizeBuiltinProfileColors', () => {
  it('fills missing or invalid colors with the defaults', () => {
    expect(sanitizeBuiltinProfileColors(undefined)).toEqual(DEFAULT_BUILTIN_PROFILE_COLORS)
    expect(sanitizeBuiltinProfileColors({ claude: '#123456', codex: 'nope' })).toEqual({
      claude: '#123456',
      codex: DEFAULT_BUILTIN_PROFILE_COLORS.codex
    })
  })
})

describe('sanitizeCustomProfiles', () => {
  it('always returns the three slots in order', () => {
    expect(sanitizeCustomProfiles(undefined)).toEqual(defaultCustomProfiles())
    expect(sanitizeCustomProfiles('garbage').map((p) => p.id)).toEqual(['custom-1', 'custom-2', 'custom-3'])
  })

  it('keeps valid fields, trims, and repairs the rest', () => {
    const [a, b, c] = sanitizeCustomProfiles([
      { id: 'custom-3', label: '  Gemini ', color: '#abcdef', command: ' gemini --yolo ' },
      { id: 'custom-1', label: '', color: 'bad', command: 42 },
      { id: 'bogus', label: 'x', color: '#000000', command: 'x' }
    ])
    expect(a).toEqual({ id: 'custom-1', label: 'Custom 1', color: DEFAULT_CUSTOM_PROFILE_COLORS['custom-1'], command: '' })
    expect(b).toEqual(defaultCustomProfiles()[1])
    expect(c).toEqual({ id: 'custom-3', label: 'Gemini', color: '#abcdef', command: 'gemini --yolo' })
  })
})

describe('buildTerminalProfiles', () => {
  it('lists built-ins first with registry labels and infers custom providers', () => {
    const profiles = buildTerminalProfiles(
      { claude: '#111111', codex: '#222222' },
      sanitizeCustomProfiles([{ id: 'custom-2', label: 'Opus', color: '#333333', command: 'claude --model opus' }])
    )
    expect(profiles.map((p) => p.id)).toEqual(['claude', 'codex', 'custom-1', 'custom-2', 'custom-3'])
    expect(profiles[0]).toMatchObject({ label: 'Claude Code', command: 'claude', color: '#111111', providerId: 'claude', builtin: true })
    expect(profiles[1]).toMatchObject({ label: 'Codex', command: 'codex', color: '#222222', providerId: 'codex', builtin: true })
    expect(profiles[3]).toMatchObject({ label: 'Opus', command: 'claude --model opus', providerId: 'claude', builtin: false })
    expect(profiles[2].command).toBe('')
    expect(profiles[2].providerId).toBe('custom')
  })

  it('toTabProfileMeta carries only what a tab needs', () => {
    const [claude] = buildTerminalProfiles(DEFAULT_BUILTIN_PROFILE_COLORS, defaultCustomProfiles())
    expect(toTabProfileMeta(claude)).toEqual({
      profileId: 'claude',
      providerId: 'claude',
      label: 'Claude Code',
      color: DEFAULT_BUILTIN_PROFILE_COLORS.claude
    })
  })
})
