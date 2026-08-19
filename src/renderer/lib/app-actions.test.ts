import { describe, it, expect } from 'vitest'
import { ACTION_SPECS, dispatchAppAction, resolveBooleanTarget } from './app-actions'

const MENU_ACTIONS = [
  'center-tab-claude',
  'center-tab-editor',
  'center-tab-skills',
  'center-tab-terminals',
  'clear-context',
  'close-file-tab',
  'close-project',
  'git-commit',
  'git-pull-rebase',
  'new-claude-terminal',
  'new-project',
  'new-shell-terminal',
  'open-palette',
  'open-palette-files',
  'restart-claude',
  'save-file',
  'settings',
  'show-statistics',
  'show-usage',
  'terminal-tab-next',
  'terminal-tab-prev',
  'toggle-dashboard',
  'toggle-variant'
]

const DESTRUCTIVE = [
  'close-project',
  'restart-claude',
  'clear-context',
  'git-pull-rebase',
  'git-commit',
  'switch-branch'
]

const TARGET_ACTIONS = [
  'switch-project',
  'focus-terminal',
  'open-file',
  'switch-branch',
  'set-theme'
]

describe('ACTION_SPECS menu parity', () => {
  it('has a spec for every action the native menu emits', () => {
    const missing = MENU_ACTIONS.filter((a) => !ACTION_SPECS[a])
    expect(missing).toEqual([])
  })

  it('flags exactly the destructive actions', () => {
    const flagged = Object.entries(ACTION_SPECS)
      .filter(([, spec]) => spec.destructive)
      .map(([name]) => name)
      .sort()
    expect(flagged).toEqual([...DESTRUCTIVE].sort())
  })

  it('treats every menu action as target-free', () => {
    const needingTarget = MENU_ACTIONS.filter((a) => ACTION_SPECS[a]?.needsTarget)
    expect(needingTarget).toEqual([])
  })
})

const PALETTE_ACTIONS = [
  'new-claude-terminal',
  'new-shell-terminal',
  'restart-claude',
  'clear-context',
  'paste-screenshot',
  'save-file',
  'close-file-tab',
  'center-tab-editor',
  'center-tab-claude',
  'reload-tree',
  'close-project',
  'new-project',
  'toggle-variant',
  'toggle-minimap',
  'toggle-autosave',
  'toggle-format-on-save'
]

describe('ACTION_SPECS palette parity', () => {
  it('has a spec for every action the command palette dispatches', () => {
    const missing = PALETTE_ACTIONS.filter((a) => !ACTION_SPECS[a])
    expect(missing).toEqual([])
  })
})

describe('resolveBooleanTarget', () => {
  it('toggles when no target is given', () => {
    expect(resolveBooleanTarget(undefined, false)).toBe(true)
    expect(resolveBooleanTarget(undefined, true)).toBe(false)
  })

  it('is declarative and idempotent for explicit on/off targets', () => {
    for (const on of ['on', 'true', 'enable', 'enabled', 'yes', 'show']) {
      expect(resolveBooleanTarget(on, false)).toBe(true)
      expect(resolveBooleanTarget(on, true)).toBe(true)
    }
    for (const off of ['off', 'false', 'disable', 'disabled', 'no', 'hide']) {
      expect(resolveBooleanTarget(off, false)).toBe(false)
      expect(resolveBooleanTarget(off, true)).toBe(false)
    }
  })

  it('ignores case and surrounding whitespace', () => {
    expect(resolveBooleanTarget('  ON  ', false)).toBe(true)
    expect(resolveBooleanTarget('Off', true)).toBe(false)
  })

  it('falls back to toggling on an unrecognised target', () => {
    expect(resolveBooleanTarget('banana', false)).toBe(true)
    expect(resolveBooleanTarget('banana', true)).toBe(false)
  })
})

describe('target-resolving actions', () => {
  it('declares needsTarget for every action that resolves a target', () => {
    const notFlagged = TARGET_ACTIONS.filter((a) => !ACTION_SPECS[a]?.needsTarget)
    expect(notFlagged).toEqual([])
  })

  it('rejects a target-requiring action dispatched without a target', () => {
    for (const action of TARGET_ACTIONS) {
      expect(dispatchAppAction({ action })).toEqual({ ok: false, reason: 'no-target' })
    }
  })

  it('rejects an unresolvable target rather than acting on the nearest match', () => {
    expect(dispatchAppAction({ action: 'set-theme', target: 'nonexistent-theme' })).toEqual({
      ok: false,
      reason: 'unresolved'
    })
  })
})

describe('dispatchAppAction validation', () => {
  it('rejects an action that is not in the allowlist', () => {
    expect(dispatchAppAction({ action: 'rm-rf' })).toEqual({
      ok: false,
      reason: 'unknown-action'
    })
  })

  it('rejects a plausible-looking but unregistered action', () => {
    expect(dispatchAppAction({ action: 'delete_everything', target: '/' })).toEqual({
      ok: false,
      reason: 'unknown-action'
    })
  })

  it('rejects an out-of-range project ordinal without throwing', () => {
    expect(dispatchAppAction({ action: 'switch-project-9' })).toEqual({
      ok: false,
      reason: 'unresolved'
    })
  })

  it('does not treat a malformed switch-project action as valid', () => {
    expect(dispatchAppAction({ action: 'switch-project-abc' })).toEqual({
      ok: false,
      reason: 'unknown-action'
    })
  })
})
