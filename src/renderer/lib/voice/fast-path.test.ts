import { describe, it, expect } from 'vitest'
import { matchFastPath, normalizeUtterance } from './fast-path'
import { ACTION_SPECS } from '@/lib/app-actions'

describe('normalizeUtterance', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeUtterance('  Show   The  Editor ')).toBe('show the editor')
  })

  it('drops trailing sentence punctuation from dictation', () => {
    expect(normalizeUtterance('save the file.')).toBe('save the file')
    expect(normalizeUtterance('show git!')).toBe('show git')
  })
})

describe('matchFastPath', () => {
  it('matches bare navigation phrases', () => {
    expect(matchFastPath('show the editor')).toEqual({ action: 'center-tab-editor' })
    expect(matchFastPath('go to dashboard')).toEqual({ action: 'toggle-dashboard' })
    expect(matchFastPath('save')).toEqual({ action: 'save-file' })
  })

  it('is declarative about git rather than toggling', () => {
    expect(matchFastPath('show git')).toEqual({ action: 'show-git', target: 'on' })
    expect(matchFastPath('hide git')).toEqual({ action: 'show-git', target: 'off' })
  })

  it('captures targets', () => {
    expect(matchFastPath('switch to the petsitters project')).toEqual({
      action: 'switch-project',
      target: 'petsitters'
    })
    expect(matchFastPath('focus the second terminal')).toEqual({
      action: 'focus-terminal',
      target: 'second'
    })
    expect(matchFastPath('make it dracula')).toEqual({
      action: 'set-theme',
      target: 'dracula'
    })
  })

  it('returns null for anything ambiguous so the agent handles it', () => {
    expect(matchFastPath('open the file where the terminal stuff lives')).toBeNull()
    expect(matchFastPath('what am I working on')).toBeNull()
    expect(matchFastPath('')).toBeNull()
  })

  it('only emits actions that actually exist in ACTION_SPECS', () => {
    const utterances = [
      'show the editor',
      'go to dashboard',
      'open settings',
      'show usage',
      'show stats',
      'show the terminals',
      'show skills',
      'save the file',
      'reload the tree',
      'new shell',
      'next terminal',
      'previous tab',
      'show git',
      'hide git',
      'switch to the foo project',
      'focus the llm terminal',
      'theme dracula',
      'make it nord'
    ]
    for (const u of utterances) {
      const matched = matchFastPath(u)
      expect(matched, `"${u}" should match a fast-path rule`).not.toBeNull()
      expect(ACTION_SPECS[matched!.action], `"${u}" -> ${matched!.action}`).toBeDefined()
    }
  })
})
