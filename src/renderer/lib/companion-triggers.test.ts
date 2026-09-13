import { describe, it, expect } from 'vitest'
import { CompanionMatcher } from './companion-triggers'
import { COMPANION_TRIGGERS } from '@/config/companion-trigger-registry'

function fixedClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

function matcherAt(now: () => number, pick = (): number => 0): CompanionMatcher {
  return new CompanionMatcher(COMPANION_TRIGGERS, { now, pick })
}

describe('CompanionMatcher pattern hits', () => {
  const cases: Array<[string, string]> = [
    ['Permission to use Bash with command git push has been denied.', 'permission-denied'],
    ['Exit code 128', 'command-failed'],
    ['fatal: no upstream configured for branch', 'command-failed'],
    ['(eval):1: no matches found: --include=*.tsx', 'no-matches'],
    ['⏺ Read(src/renderer/lib/sound.ts)', 'reading-file'],
    ['⏺ Edit(src/renderer/components/git/GitTree.tsx)', 'editing-file'],
    ['⏺ Grep(pattern: "companion")', 'searching'],
    ['⏺ Bash(git status)', 'running-command'],
    ['[llm/20260913161342-ms27eb f68fd4c] Fix git panel header height', 'git-commit'],
    [' 1 file changed, 1 insertion(+), 1 deletion(-)', 'git-commit'],
    ['Let me find out what exists before designing anything.', 'long-thinking'],
    ['I was wrong twice, and I want to flag that plainly.', 'admitting-wrong']
  ]

  for (const [line, expected] of cases) {
    it(`matches ${expected} for: ${line.slice(0, 40)}`, () => {
      const clock = fixedClock()
      expect(matcherAt(clock.now).match(line)?.triggerId).toBe(expected)
    })
  }

  it('strips ANSI before matching', () => {
    const clock = fixedClock()
    expect(matcherAt(clock.now).match('\x1b[31mExit code 1\x1b[0m')?.triggerId).toBe('command-failed')
  })

  it('returns null for ordinary output', () => {
    const clock = fixedClock()
    expect(matcherAt(clock.now).match('just some regular terminal noise')).toBeNull()
  })

  it('prefers the failure over the tool line that precedes it', () => {
    const clock = fixedClock()
    expect(matcherAt(clock.now).match('error: Bash(npm test) blew up')?.triggerId).toBe('command-failed')
  })
})

describe('cooldown', () => {
  it('suppresses a repeat inside the cooldown window', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(1000)
    expect(matcher.match('Exit code 2')).toBeNull()
  })

  it('fires again once the cooldown has elapsed', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(6001)
    expect(matcher.match('Exit code 2')).not.toBeNull()
  })

  it('tracks cooldowns per trigger, not globally', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    expect(matcher.match('Exit code 2')).not.toBeNull()
    expect(matcher.match('⏺ Read(a.ts)')?.triggerId).toBe('reading-file')
  })
})

describe('line variety', () => {
  it('never returns the same line twice in a row', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, { now: clock.now, pick: () => 0 })
    const first = matcher.match('⏺ Read(a.ts)')?.line
    clock.advance(10_000)
    const second = matcher.match('⏺ Read(b.ts)')?.line
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
  })

  it('draws from the trigger own phrase list', () => {
    const clock = fixedClock()
    const reading = COMPANION_TRIGGERS.find((t) => t.id === 'reading-file')!
    const line = matcherAt(clock.now).match('⏺ Read(a.ts)')?.line
    expect(reading.lines).toContain(line)
  })
})

describe('registry hygiene', () => {
  it('has unique trigger ids', () => {
    const ids = COMPANION_TRIGGERS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every trigger at least three distinct phrases', () => {
    for (const trigger of COMPANION_TRIGGERS) {
      expect(new Set(trigger.lines).size).toBeGreaterThanOrEqual(3)
    }
  })

  it('writes every phrase as spaced words, never glued together', () => {
    for (const trigger of COMPANION_TRIGGERS) {
      for (const line of trigger.lines) {
        expect(line).toMatch(/\s/)
        expect(line).not.toMatch(/[a-z][A-Z]/)
      }
    }
  })
})
