import { describe, it, expect, beforeEach } from 'vitest'
import {
  useTerminalPrefsStore,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE
} from './terminal-prefs-store'

const reset = (): void => {
  useTerminalPrefsStore.setState({
    fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
    fontSize: DEFAULT_TERMINAL_FONT_SIZE
  })
}

describe('terminal-prefs-store', () => {
  beforeEach(reset)

  describe('setFontSize', () => {
    it('clamps to the allowed range', () => {
      useTerminalPrefsStore.getState().setFontSize(2)
      expect(useTerminalPrefsStore.getState().fontSize).toBe(MIN_TERMINAL_FONT_SIZE)
      useTerminalPrefsStore.getState().setFontSize(200)
      expect(useTerminalPrefsStore.getState().fontSize).toBe(MAX_TERMINAL_FONT_SIZE)
    })

    it('rounds to int', () => {
      useTerminalPrefsStore.getState().setFontSize(14.6)
      expect(useTerminalPrefsStore.getState().fontSize).toBe(15)
    })

    it('falls back to the default on NaN', () => {
      useTerminalPrefsStore.getState().setFontSize(NaN)
      expect(useTerminalPrefsStore.getState().fontSize).toBe(DEFAULT_TERMINAL_FONT_SIZE)
    })
  })

  describe('setFontFamily', () => {
    it('trims and stores the family', () => {
      useTerminalPrefsStore.getState().setFontFamily('  Hack Nerd Font, monospace ')
      expect(useTerminalPrefsStore.getState().fontFamily).toBe('Hack Nerd Font, monospace')
    })

    it('falls back to the default when blank', () => {
      useTerminalPrefsStore.getState().setFontFamily('   ')
      expect(useTerminalPrefsStore.getState().fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
    })
  })
})
