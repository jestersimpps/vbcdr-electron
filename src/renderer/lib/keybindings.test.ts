import { describe, expect, it } from 'vitest'
import { acceleratorFromKeyboardEvent, formatAccelerator } from './keybindings'

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'k', code: 'KeyK', metaKey: false, ctrlKey: false,
    altKey: false, shiftKey: false, ...overrides
  } as KeyboardEvent
}

describe('acceleratorFromKeyboardEvent', () => {
  it('uses the portable primary modifier', () => {
    expect(acceleratorFromKeyboardEvent(key({ metaKey: true }), true)).toBe('CmdOrCtrl+K')
    expect(acceleratorFromKeyboardEvent(key({ ctrlKey: true }), false)).toBe('CmdOrCtrl+K')
  })

  it('preserves additional modifiers in a stable order', () => {
    expect(acceleratorFromKeyboardEvent(key({ metaKey: true, altKey: true, shiftKey: true }), true))
      .toBe('CmdOrCtrl+Alt+Shift+K')
  })

  it('rejects unmodified typing keys but accepts function keys', () => {
    expect(acceleratorFromKeyboardEvent(key(), true)).toBeNull()
    expect(acceleratorFromKeyboardEvent(key({ key: 'F5', code: 'F5' }), true)).toBe('F5')
  })
})

describe('formatAccelerator', () => {
  it('formats shortcuts for macOS and other platforms', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+K', true)).toBe('⌘⇧K')
    expect(formatAccelerator('CmdOrCtrl+Shift+K', false)).toBe('Ctrl+Shift+K')
    expect(formatAccelerator(undefined, true)).toBe('Unassigned')
  })
})
