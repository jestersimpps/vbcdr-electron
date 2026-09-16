import { describe, expect, it } from 'vitest'
import {
  applyKeybindingOverride,
  effectiveAccelerator,
  isValidAccelerator,
  KEYBINDING_DEFINITIONS,
  reservedAcceleratorReason,
  sanitizeKeybindingOverrides
} from './keybindings'

describe('keybinding definitions', () => {
  it('uses the default unless an override exists', () => {
    expect(effectiveAccelerator('save-file', {})).toBe('CmdOrCtrl+S')
    expect(effectiveAccelerator('save-file', { 'save-file': 'CmdOrCtrl+Shift+S' }))
      .toBe('CmdOrCtrl+Shift+S')
  })

  it('supports disabling a keybinding', () => {
    expect(effectiveAccelerator('save-file', { 'save-file': '' })).toBeUndefined()
  })

  it('drops unknown and malformed persisted entries', () => {
    expect(sanitizeKeybindingOverrides({ 'save-file': 'Alt+S', nope: 'Alt+X', settings: 4 }))
      .toEqual({ 'save-file': 'Alt+S' })
  })

  it('disables stale overrides that collide with numbered switching', () => {
    expect(sanitizeKeybindingOverrides({ 'center-tab-editor': 'CmdOrCtrl+1' }))
      .toEqual({ 'center-tab-editor': '' })
  })

  it('reserves the numbered switching rows and keeps CmdOrCtrl+N for a new LLM tab', () => {
    expect(reservedAcceleratorReason('CmdOrCtrl+3')).toBe('Switch LLM tabs')
    expect(reservedAcceleratorReason('Alt+3')).toBe('Switch projects')
    expect(reservedAcceleratorReason('CmdOrCtrl+N')).toBeNull()
    expect(effectiveAccelerator('new-llm-tab', {})).toBe('CmdOrCtrl+N')
    expect(effectiveAccelerator('new-project', {})).toBe('CmdOrCtrl+Shift+N')
  })

  it('has unique defaults that do not overlap reserved shortcuts', () => {
    const defaults = KEYBINDING_DEFINITIONS.map((item) => item.defaultAccelerator.toLowerCase())
    expect(new Set(defaults).size).toBe(defaults.length)
    expect(KEYBINDING_DEFINITIONS.filter(
      (item) => reservedAcceleratorReason(item.defaultAccelerator)
    )).toEqual([])
  })

  it('validates accelerators accepted by the editor', () => {
    expect(isValidAccelerator('CmdOrCtrl+Alt+K')).toBe(true)
    expect(isValidAccelerator('F5')).toBe(true)
    expect(isValidAccelerator('K')).toBe(false)
    expect(isValidAccelerator('CmdOrCtrl+NotAKey')).toBe(false)
  })

  it('atomically unassigns the previous owner of a shortcut', () => {
    expect(applyKeybindingOverride({}, 'save-file', 'CmdOrCtrl+P')).toMatchObject({
      'save-file': 'CmdOrCtrl+P',
      'open-palette-files': ''
    })
  })

  it('resolves a conflict when resetting a command to its default', () => {
    expect(applyKeybindingOverride(
      { 'save-file': 'CmdOrCtrl+P', 'open-palette-files': '' },
      'open-palette-files',
      null
    )).toMatchObject({ 'save-file': '' })
  })
})
