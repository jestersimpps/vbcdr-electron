import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseSettings,
  toView,
  isCustomized,
  applyPreset,
  matchesPreset,
  addRule,
  removeRule,
  serialize,
  settingsLocalPath,
  readSettings,
  writeSettings,
  DEFAULT_VIEW,
  type ClaudeSettings,
  type PresetLike
} from './claude-permissions'

describe('settingsLocalPath', () => {
  it('joins project path with .claude/settings.local.json', () => {
    expect(settingsLocalPath('/foo/bar')).toBe('/foo/bar/.claude/settings.local.json')
  })

  it('strips trailing slashes', () => {
    expect(settingsLocalPath('/foo/bar/')).toBe('/foo/bar/.claude/settings.local.json')
  })
})

describe('parseSettings', () => {
  it('returns {} for empty string', () => {
    expect(parseSettings('')).toEqual({})
    expect(parseSettings('   \n')).toEqual({})
  })

  it('parses JSON', () => {
    expect(parseSettings('{"permissions":{"allow":["Read"]}}')).toEqual({
      permissions: { allow: ['Read'] }
    })
  })
})

describe('toView', () => {
  it('returns defaults for empty settings', () => {
    expect(toView({})).toEqual(DEFAULT_VIEW)
  })

  it('reads mode and rule lists', () => {
    expect(
      toView({
        permissions: { defaultMode: 'plan', allow: ['Read'], ask: ['Bash(*)'], deny: ['Bash(rm:*)'] }
      })
    ).toEqual({ mode: 'plan', allow: ['Read'], ask: ['Bash(*)'], deny: ['Bash(rm:*)'] })
  })

  it('clones lists so callers cannot mutate the source', () => {
    const settings: ClaudeSettings = { permissions: { allow: ['Read'] } }
    const view = toView(settings)
    view.allow.push('Write')
    expect(settings.permissions?.allow).toEqual(['Read'])
  })
})

describe('isCustomized', () => {
  it('false for default view', () => {
    expect(isCustomized(DEFAULT_VIEW)).toBe(false)
  })

  it('true when mode differs', () => {
    expect(isCustomized({ ...DEFAULT_VIEW, mode: 'plan' })).toBe(true)
  })

  it('true when any rule list is non-empty', () => {
    expect(isCustomized({ ...DEFAULT_VIEW, allow: ['Read'] })).toBe(true)
    expect(isCustomized({ ...DEFAULT_VIEW, ask: ['Bash(*)'] })).toBe(true)
    expect(isCustomized({ ...DEFAULT_VIEW, deny: ['Bash(rm:*)'] })).toBe(true)
  })
})

describe('addRule', () => {
  it('adds to empty bucket', () => {
    expect(addRule({}, 'allow', 'Read')).toEqual({ permissions: { allow: ['Read'] } })
  })

  it('appends to existing bucket', () => {
    expect(addRule({ permissions: { allow: ['Read'] } }, 'allow', 'Write')).toEqual({
      permissions: { allow: ['Read', 'Write'] }
    })
  })

  it('does not duplicate', () => {
    const settings: ClaudeSettings = { permissions: { allow: ['Read'] } }
    expect(addRule(settings, 'allow', 'Read')).toBe(settings)
  })

  it('trims whitespace', () => {
    expect(addRule({}, 'deny', '  Bash(rm:*)  ')).toEqual({
      permissions: { deny: ['Bash(rm:*)'] }
    })
  })

  it('ignores empty rules', () => {
    const settings: ClaudeSettings = {}
    expect(addRule(settings, 'allow', '   ')).toBe(settings)
  })
})

describe('removeRule', () => {
  it('removes a rule', () => {
    expect(removeRule({ permissions: { allow: ['Read', 'Write'] } }, 'allow', 'Read')).toEqual({
      permissions: { allow: ['Write'] }
    })
  })

  it('drops the bucket key when empty', () => {
    expect(removeRule({ permissions: { allow: ['Read'] } }, 'allow', 'Read')).toEqual({})
  })

  it('drops the permissions block when fully empty', () => {
    expect(removeRule({ permissions: { allow: ['Read'] } }, 'allow', 'Read')).toEqual({})
  })

  it('keeps permissions when other keys remain', () => {
    expect(removeRule({ permissions: { allow: ['Read'], defaultMode: 'plan' } }, 'allow', 'Read'))
      .toEqual({ permissions: { defaultMode: 'plan' } })
  })

  it('preserves unmanaged top-level keys', () => {
    expect(
      removeRule({ hooks: {}, permissions: { allow: ['Read'] } } as ClaudeSettings, 'allow', 'Read')
    ).toEqual({ hooks: {} })
  })
})

describe('applyPreset', () => {
  const strict: PresetLike = {
    mode: 'default',
    allow: ['Read'],
    ask: [],
    deny: ['Bash(git push *)']
  }
  const yolo: PresetLike = { mode: 'bypassPermissions', allow: [], ask: [], deny: [] }
  const permissive: PresetLike = {
    mode: 'acceptEdits',
    allow: ['Bash(*)', 'Read'],
    ask: [],
    deny: []
  }

  it('writes mode + lists for a default-mode preset', () => {
    expect(applyPreset({}, strict)).toEqual({
      permissions: { allow: ['Read'], deny: ['Bash(git push *)'] }
    })
  })

  it('writes defaultMode for non-default preset and includes lists', () => {
    expect(applyPreset({}, permissive)).toEqual({
      permissions: { defaultMode: 'acceptEdits', allow: ['Bash(*)', 'Read'] }
    })
  })

  it('writes only mode for empty-list preset', () => {
    expect(applyPreset({}, yolo)).toEqual({ permissions: { defaultMode: 'bypassPermissions' } })
  })

  it('overwrites prior allow/ask/deny entirely', () => {
    const seeded: ClaudeSettings = { permissions: { allow: ['Old'], ask: ['Other'], deny: ['Bash(rm:*)'] } }
    expect(applyPreset(seeded, strict)).toEqual({
      permissions: { allow: ['Read'], deny: ['Bash(git push *)'] }
    })
  })

  it('preserves unmanaged top-level keys', () => {
    expect(applyPreset({ hooks: {} } as ClaudeSettings, yolo)).toEqual({
      hooks: {},
      permissions: { defaultMode: 'bypassPermissions' }
    })
  })

  it('clears prior stashed rules', () => {
    const stashed: ClaudeSettings = {
      permissions: { defaultMode: 'plan' },
      _vbcdrStashedRules: { allow: ['X'] }
    }
    const after = applyPreset(stashed, strict)
    expect(after._vbcdrStashedRules).toBeUndefined()
  })
})

describe('matchesPreset', () => {
  const strict: PresetLike = {
    mode: 'default',
    allow: ['Read'],
    ask: [],
    deny: ['Bash(git push *)']
  }

  it('true when mode + lists match (set equality, order-independent)', () => {
    expect(
      matchesPreset({ mode: 'default', allow: ['Read'], ask: [], deny: ['Bash(git push *)'] }, strict)
    ).toBe(true)
  })

  it('false when mode differs', () => {
    expect(
      matchesPreset({ mode: 'plan', allow: ['Read'], ask: [], deny: ['Bash(git push *)'] }, strict)
    ).toBe(false)
  })

  it('false when a rule list differs', () => {
    expect(matchesPreset({ mode: 'default', allow: [], ask: [], deny: [] }, strict)).toBe(false)
    expect(
      matchesPreset({ mode: 'default', allow: ['Read', 'Write'], ask: [], deny: ['Bash(git push *)'] }, strict)
    ).toBe(false)
  })
})

describe('serialize', () => {
  it('produces 2-space JSON with trailing newline', () => {
    expect(serialize({ permissions: { allow: ['Read'] } })).toBe(
      '{\n  "permissions": {\n    "allow": [\n      "Read"\n    ]\n  }\n}\n'
    )
  })
})

describe('readSettings / writeSettings', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      api: {
        claude: {
          readFile: vi.fn(),
          writeFile: vi.fn()
        }
      }
    })
  })

  it('returns {} when read throws (file missing)', async () => {
    ;(window.api.claude.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'))
    expect(await readSettings('/proj')).toEqual({})
  })

  it('parses on success', async () => {
    ;(window.api.claude.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('{"permissions":{"defaultMode":"plan"}}')
    expect(await readSettings('/proj')).toEqual({ permissions: { defaultMode: 'plan' } })
  })

  it('writes serialized JSON to settings.local.json', async () => {
    await writeSettings('/proj', { permissions: { defaultMode: 'plan' } })
    expect(window.api.claude.writeFile).toHaveBeenCalledWith(
      '/proj/.claude/settings.local.json',
      '{\n  "permissions": {\n    "defaultMode": "plan"\n  }\n}\n',
      '/proj'
    )
  })
})
