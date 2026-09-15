import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUILTIN_PROFILE_COLORS,
  buildTerminalProfiles,
  createCustomProfile,
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
  it('returns an empty list for missing or invalid data', () => {
    expect(sanitizeCustomProfiles(undefined)).toEqual(defaultCustomProfiles())
    expect(sanitizeCustomProfiles('garbage')).toEqual([])
  })

  it('keeps valid fields in order, trims, and drops malformed entries', () => {
    const profiles = sanitizeCustomProfiles([
      { id: 'custom-3', label: '  Gemini ', color: '#abcdef', command: ' gemini --yolo ' },
      { id: 'custom-1', label: '', color: 'bad', command: 42 },
      { id: 'bogus', label: 'x', color: '#000000', command: 'x' },
      { id: 'custom-3', label: 'Duplicate', color: '#000000', command: 'x' }
    ])
    expect(profiles).toEqual([
      { id: 'custom-3', label: 'Gemini', color: '#abcdef', command: 'gemini --yolo' },
      { id: 'custom-1', label: 'Custom 2', color: '#c084fc', command: '' }
    ])
  })
})

describe('createCustomProfile', () => {
  it('creates the next editable profile with a rotating default color', () => {
    const first = createCustomProfile([], 'custom-new')
    const second = createCustomProfile([first], 'custom-next')
    expect(first).toEqual({ id: 'custom-new', label: 'Custom 1', color: '#60a5fa', command: '' })
    expect(second).toEqual({ id: 'custom-next', label: 'Custom 2', color: '#c084fc', command: '' })
  })
})

describe('buildTerminalProfiles', () => {
  it('lists built-ins first with registry labels and infers custom providers', () => {
    const profiles = buildTerminalProfiles(
      { claude: '#111111', codex: '#222222' },
      sanitizeCustomProfiles([{ id: 'custom-2', label: 'Opus', color: '#333333', command: 'claude --model opus' }])
    )
    expect(profiles.map((p) => p.id)).toEqual(['claude', 'codex', 'custom-2'])
    expect(profiles[0]).toMatchObject({ label: 'Claude Code', command: 'claude', color: '#111111', providerId: 'claude', builtin: true })
    expect(profiles[1]).toMatchObject({ label: 'Codex', command: 'codex', color: '#222222', providerId: 'codex', builtin: true })
    expect(profiles[2]).toMatchObject({ label: 'Opus', command: 'claude --model opus', providerId: 'claude', builtin: false })
  })

  it('omits built-in profiles that the user removed', () => {
    const profiles = buildTerminalProfiles(DEFAULT_BUILTIN_PROFILE_COLORS, [], ['claude'])
    expect(profiles.map((profile) => profile.id)).toEqual(['codex'])
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
