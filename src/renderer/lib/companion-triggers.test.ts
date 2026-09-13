import { describe, it, expect } from 'vitest'
import { CompanionMatcher } from './companion-triggers'
import { COMPANION_TRIGGERS } from '@/config/companion-trigger-registry'

function fixedClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

/** Most cases exercise one trigger at a time, so the global floor is off here. */
function matcherAt(now: () => number, pick = (): number => 0): CompanionMatcher {
  return new CompanionMatcher(COMPANION_TRIGGERS, { now, pick, globalCooldownMs: 0 })
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

describe('global cooldown', () => {
  it('keeps a burst of different triggers down to one line', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, { now: clock.now, pick: () => 0 })
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(500)
    expect(matcher.match('⏺ Read(a.ts)')).toBeNull()
  })

  it('speaks again once the floor has passed', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, { now: clock.now, pick: () => 0 })
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(9001)
    expect(matcher.match('⏺ Read(a.ts)')?.triggerId).toBe('reading-file')
  })
})

describe('attention triggers', () => {
  const PROMPT = 'Do you want to proceed?'

  it('speaks through the global floor that holds ordinary chatter back', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, { now: clock.now, pick: () => 0 })
    expect(matcher.match('⏺ Read(a.ts)')).not.toBeNull()
    clock.advance(500)
    expect(matcher.match('⏺ Bash(ls)')).toBeNull()
    expect(matcher.match(PROMPT)?.triggerId).toBe('asking-user')
  })

  it('speaks through marker suppression', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    matcher.suppress()
    clock.advance(1000)
    expect(matcher.match(PROMPT)?.triggerId).toBe('asking-user')
  })

  it('still respects its own cooldown, so a repainting prompt box fires once', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    expect(matcher.match(PROMPT)).not.toBeNull()
    clock.advance(1000)
    expect(matcher.match(PROMPT)).toBeNull()
  })

  it('flags the reaction so callers can treat it as urgent', () => {
    const clock = fixedClock()
    expect(matcherAt(clock.now).match(PROMPT)?.attention).toBe(true)
  })

  it('leaves ordinary reactions unflagged', () => {
    const clock = fixedClock()
    expect(matcherAt(clock.now).match('⏺ Read(a.ts)')?.attention).toBeFalsy()
  })

  it('catches the permission box wording, not just the old phrasings', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    expect(matcher.match('Do you want to make this edit to CompanionDock.tsx?')?.triggerId).toBe(
      'asking-user'
    )
  })

  it('stays quiet once the prompt has been answered', () => {
    const clock = fixedClock()
    expect(matcherAt(clock.now).match('User answered: yes')).toBeNull()
  })
})

describe('marker suppression', () => {
  it('stays quiet while an authored line is still landing', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    matcher.suppress()
    clock.advance(1000)
    expect(matcher.match('Exit code 2')).toBeNull()
  })

  it('resumes after the suppression window', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    matcher.suppress()
    clock.advance(8001)
    expect(matcher.match('Exit code 2')).not.toBeNull()
  })
})

describe('poke', () => {
  it('answers a click even while the global floor is blocking chatter', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, { now: clock.now, pick: () => 0 })
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(100)
    expect(matcher.poke().line).toBeTruthy()
  })

  it('escalates through the tiers as the clicking continues', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    const tiers: string[] = []
    for (let i = 0; i < 3; i++) {
      tiers.push(matcher.poke().triggerId)
      clock.advance(300)
    }
    expect(tiers).toEqual(['poke:0', 'poke:1', 'poke:2'])
  })

  it('stays on the last tier rather than running off the end', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    let last = ''
    for (let i = 0; i < 8; i++) {
      last = matcher.poke().triggerId
      clock.advance(300)
    }
    expect(last).toBe('poke:2')
  })

  it('softens again after a quiet gap', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    matcher.poke()
    matcher.poke()
    clock.advance(20_001)
    expect(matcher.poke().triggerId).toBe('poke:0')
  })

  it('claims the floor so a regex line does not land on top of it', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, { now: clock.now, pick: () => 0 })
    matcher.poke()
    clock.advance(500)
    expect(matcher.match('Exit code 2')).toBeNull()
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
    expect(reading.lines).toContainEqual(line)
  })
})

describe('registry hygiene', () => {
  it('has unique trigger ids', () => {
    const ids = COMPANION_TRIGGERS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every trigger at least three distinct phrases', () => {
    for (const trigger of COMPANION_TRIGGERS) {
      expect(new Set(trigger.lines.map((l) => l.bare)).size).toBeGreaterThanOrEqual(3)
    }
  })

  it('writes every phrase as spaced words, never glued together', () => {
    for (const trigger of COMPANION_TRIGGERS) {
      for (const { bare, named } of trigger.lines) {
        expect(bare).toMatch(/\s/)
        expect(bare).not.toMatch(/[a-z][A-Z]/)
        expect(named).toMatch(/\s/)
      }
    }
  })

  it('gives every named phrase a project slot to fill', () => {
    for (const trigger of COMPANION_TRIGGERS) {
      for (const { named } of trigger.lines) {
        expect(named).toContain('{project}')
      }
    }
  })

  it('leaves the bare phrase free of any slot', () => {
    for (const trigger of COMPANION_TRIGGERS) {
      for (const { bare } of trigger.lines) {
        expect(bare).not.toContain('{project}')
      }
    }
  })
})
