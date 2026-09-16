import { describe, it, expect } from 'vitest'
import { extractPromptCommand, looksLikeInteractivePrompt, parseTokenCount } from './terminal-text'

describe('parseTokenCount', () => {
  it('parses plain integers', () => {
    expect(parseTokenCount('250000 tokens')).toBe(250000)
  })

  it('parses comma-grouped numbers', () => {
    expect(parseTokenCount('250,000 tokens')).toBe(250000)
  })

  it('parses k suffix', () => {
    expect(parseTokenCount('25k tokens')).toBe(25000)
    expect(parseTokenCount('1.2k tokens')).toBe(1200)
  })

  it('parses m suffix', () => {
    expect(parseTokenCount('1.5m tokens')).toBe(1500000)
  })

  it('does not mangle decimals (regression: 1.2 must not become 12)', () => {
    expect(parseTokenCount('1.2 tokens')).toBe(1)
  })

  it('matches singular token', () => {
    expect(parseTokenCount('1 token')).toBe(1)
  })

  it('returns null when no token count present', () => {
    expect(parseTokenCount('Context left until auto-compact: 23%')).toBeNull()
    expect(parseTokenCount('just some text')).toBeNull()
  })
})

describe('extractPromptCommand', () => {
  it('strips common shell prompt markers', () => {
    expect(extractPromptCommand('❯ npm run dev')).toBe('npm run dev')
    expect(extractPromptCommand('~/Sites/app % git status')).toBe('git status')
    expect(extractPromptCommand('bash-5.2$ ls -la')).toBe('ls -la')
    expect(extractPromptCommand('root# whoami')).toBe('whoami')
  })

  it('returns the trimmed line when no prompt marker is present', () => {
    expect(extractPromptCommand('  plain text  ')).toBe('plain text')
  })

  it('returns an empty string for a bare prompt', () => {
    expect(extractPromptCommand('❯ ')).toBe('')
  })
})

describe('looksLikeInteractivePrompt', () => {
  it('detects the trust-this-folder dialog', () => {
    expect(
      looksLikeInteractivePrompt('Do you trust the files in this folder?\n\n❯ 1. Yes, proceed\n  2. No, exit\n')
    ).toBe(true)
  })

  it('detects a permission-approval question', () => {
    expect(looksLikeInteractivePrompt('Do you want to allow this tool?')).toBe(true)
  })

  it('detects the confirm footer with either separator glyph', () => {
    expect(looksLikeInteractivePrompt('Enter to confirm · Esc to cancel')).toBe(true)
    expect(looksLikeInteractivePrompt('Enter to confirm • Esc to cancel')).toBe(true)
  })

  it('detects a prompt split across PTY writes once the tail is joined', () => {
    expect(looksLikeInteractivePrompt('…writing files\nDo you want to ' + 'proceed?')).toBe(true)
  })

  it('sees through ANSI styling', () => {
    expect(looksLikeInteractivePrompt('\x1b[1m❯ 1.\x1b[0m Yes, proceed')).toBe(true)
  })

  it('ignores ordinary agent output', () => {
    expect(looksLikeInteractivePrompt('Running tests...\n1205 passed\n')).toBe(false)
    expect(looksLikeInteractivePrompt('')).toBe(false)
  })

  it('does not fire on a numbered plan the agent wrote', () => {
    expect(
      looksLikeInteractivePrompt('Here is the plan:\n  1. Yes-and refactor the store\n  2. Add tests\n')
    ).toBe(false)
  })
})
