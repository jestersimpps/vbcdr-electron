import { describe, it, expect, beforeEach } from 'vitest'
import {
  useEditorPrefsStore,
  DEFAULT_AUTOSAVE_DELAY_MS,
  DEFAULT_FONT_SIZE,
  DEFAULT_TAB_SIZE
} from './editor-prefs-store'

const reset = (): void => {
  useEditorPrefsStore.setState({
    minimapEnabled: true,
    autosaveEnabled: false,
    autosaveDelayMs: DEFAULT_AUTOSAVE_DELAY_MS,
    fontSize: DEFAULT_FONT_SIZE,
    tabSize: DEFAULT_TAB_SIZE,
    bracketPairColorization: true,
    formatOnSave: false
  })
}

describe('editor-prefs-store', () => {
  beforeEach(reset)

  describe('setAutosaveDelayMs', () => {
    it('accepts values >= 250ms', () => {
      useEditorPrefsStore.getState().setAutosaveDelayMs(500)
      expect(useEditorPrefsStore.getState().autosaveDelayMs).toBe(500)
    })

    it('rejects values below 250ms', () => {
      useEditorPrefsStore.getState().setAutosaveDelayMs(100)
      expect(useEditorPrefsStore.getState().autosaveDelayMs).toBe(DEFAULT_AUTOSAVE_DELAY_MS)
    })

    it('rejects NaN', () => {
      useEditorPrefsStore.getState().setAutosaveDelayMs(NaN)
      expect(useEditorPrefsStore.getState().autosaveDelayMs).toBe(DEFAULT_AUTOSAVE_DELAY_MS)
    })

    it('rounds to int', () => {
      useEditorPrefsStore.getState().setAutosaveDelayMs(500.7)
      expect(useEditorPrefsStore.getState().autosaveDelayMs).toBe(501)
    })
  })

  describe('setFontSize', () => {
    it('clamps to [8, 32]', () => {
      useEditorPrefsStore.getState().setFontSize(4)
      expect(useEditorPrefsStore.getState().fontSize).toBe(8)
      useEditorPrefsStore.getState().setFontSize(99)
      expect(useEditorPrefsStore.getState().fontSize).toBe(32)
    })

    it('rounds and accepts mid-range', () => {
      useEditorPrefsStore.getState().setFontSize(14.6)
      expect(useEditorPrefsStore.getState().fontSize).toBe(15)
    })

    it('falls back to default on NaN', () => {
      useEditorPrefsStore.getState().setFontSize(NaN)
      expect(useEditorPrefsStore.getState().fontSize).toBe(DEFAULT_FONT_SIZE)
    })
  })

  describe('setTabSize', () => {
    it('clamps to [1, 8]', () => {
      useEditorPrefsStore.getState().setTabSize(0)
      expect(useEditorPrefsStore.getState().tabSize).toBe(1)
      useEditorPrefsStore.getState().setTabSize(20)
      expect(useEditorPrefsStore.getState().tabSize).toBe(8)
    })

    it('falls back to default on NaN', () => {
      useEditorPrefsStore.getState().setTabSize(NaN)
      expect(useEditorPrefsStore.getState().tabSize).toBe(DEFAULT_TAB_SIZE)
    })
  })

  describe('boolean setters', () => {
    it('toggle minimap, autosave, bracket, formatOnSave', () => {
      useEditorPrefsStore.getState().setMinimapEnabled(false)
      useEditorPrefsStore.getState().setAutosaveEnabled(true)
      useEditorPrefsStore.getState().setBracketPairColorization(false)
      useEditorPrefsStore.getState().setFormatOnSave(true)
      const s = useEditorPrefsStore.getState()
      expect(s.minimapEnabled).toBe(false)
      expect(s.autosaveEnabled).toBe(true)
      expect(s.bracketPairColorization).toBe(false)
      expect(s.formatOnSave).toBe(true)
    })
  })
})
