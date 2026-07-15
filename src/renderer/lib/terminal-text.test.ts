import { describe, it, expect } from 'vitest'
import { extractPromptCommand, parseTokenCount } from './terminal-text'

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
