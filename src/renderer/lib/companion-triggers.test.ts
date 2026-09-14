import { describe, it, expect } from 'vitest'
import { CompanionMatcher } from './companion-triggers'
import { COMPANION_TRIGGERS } from '@/config/companion-trigger-registry'

function fixedClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

/**
 * Most cases exercise one trigger at a time, so the global floor is off here.
 * Chattiness is opened all the way up: these cases are about patterns and
 * cooldowns, and the tiering rules get their own block below.
 */
function matcherAt(now: () => number, pick = (): number => 0): CompanionMatcher {
  return new CompanionMatcher(COMPANION_TRIGGERS, {
    now,
    pick,
    globalCooldownMs: 0,
    floor: 'chatter'
  })
}

/** As above, but with the real global floor in play. */
function matcherWithFloor(now: () => number): CompanionMatcher {
  return new CompanionMatcher(COMPANION_TRIGGERS, { now, pick: () => 0, floor: 'chatter' })
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
    const matcher = matcherWithFloor(clock.now)
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(500)
    expect(matcher.match('⏺ Read(a.ts)')).toBeNull()
  })

  it('speaks again once the floor has passed', () => {
    const clock = fixedClock()
    const matcher = matcherWithFloor(clock.now)
    expect(matcher.match('Exit code 2')).not.toBeNull()
    clock.advance(9001)
    expect(matcher.match('⏺ Read(a.ts)')?.triggerId).toBe('reading-file')
  })
})

describe('attention triggers', () => {
  const PROMPT = 'Do you want to proceed?'

  it('speaks through the global floor that holds ordinary chatter back', () => {
    const clock = fixedClock()
    const matcher = matcherWithFloor(clock.now)
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
    const matcher = matcherWithFloor(clock.now)
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
    const matcher = matcherWithFloor(clock.now)
    matcher.poke()
    clock.advance(500)
    expect(matcher.match('Exit code 2')).toBeNull()
  })
})

describe('line variety', () => {
  it('never returns the same line twice in a row', () => {
    const clock = fixedClock()
    const matcher = matcherWithFloor(clock.now)
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

describe('chattiness', () => {
  function at(level: 'attention' | 'outcome' | 'chatter', now: () => number): CompanionMatcher {
    return new CompanionMatcher(COMPANION_TRIGGERS, {
      now,
      pick: () => 0,
      globalCooldownMs: 0,
      floor: level
    })
  }

  it('speaks chatter only at the loudest level', () => {
    expect(at('chatter', fixedClock().now).match('⏺ Read(a.ts)')?.silent).toBeFalsy()
    expect(at('outcome', fixedClock().now).match('⏺ Read(a.ts)')?.silent).toBe(true)
    expect(at('attention', fixedClock().now).match('⏺ Read(a.ts)')?.silent).toBe(true)
  })

  it('speaks outcomes at the default level but not the quietest', () => {
    expect(at('outcome', fixedClock().now).match('Exit code 2')?.silent).toBeFalsy()
    expect(at('attention', fixedClock().now).match('Exit code 2')?.silent).toBe(true)
  })

  it('speaks attention lines at every level', () => {
    for (const level of ['attention', 'outcome', 'chatter'] as const) {
      expect(at(level, fixedClock().now).match('Do you want to proceed?')?.silent).toBeFalsy()
    }
  })

  it('still reports the emote when silent, so she can react without speaking', () => {
    const reaction = at('attention', fixedClock().now).match('⏺ Read(a.ts)')
    expect(reaction?.triggerId).toBe('reading-file')
    expect(reaction?.emote).toBe('reading')
  })

  it('plays no sound for a line it will not speak', () => {
    expect(at('attention', fixedClock().now).match('Exit code 2')?.soundId).toBeUndefined()
    expect(at('outcome', fixedClock().now).match('Exit code 2')?.soundId).toBeDefined()
  })

  it('does not let a silent reaction claim the floor from a spoken one', () => {
    const clock = fixedClock()
    const matcher = new CompanionMatcher(COMPANION_TRIGGERS, {
      now: clock.now,
      pick: () => 0,
      floor: 'outcome'
    })
    expect(matcher.match('⏺ Read(a.ts)')?.silent).toBe(true)
    clock.advance(500)
    expect(matcher.match('Exit code 2')?.silent).toBeFalsy()
  })

  it('takes a new level without needing a fresh matcher', () => {
    const clock = fixedClock()
    const matcher = at('attention', clock.now)
    expect(matcher.match('Exit code 2')?.silent).toBe(true)
    matcher.setChattiness('chatter')
    clock.advance(6001)
    expect(matcher.match('Exit code 2')?.silent).toBeFalsy()
  })
})

describe('idle line', () => {
  it('is never reachable by matching, since going quiet emits no line', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    for (const line of ['', ' ', 'idle', 'done for now']) {
      expect(matcher.match(line)?.triggerId).not.toBe('idle')
    }
  })

  it('hands back an idle reaction on request', () => {
    const reaction = matcherAt(fixedClock().now).idleLine()
    expect(reaction?.triggerId).toBe('idle')
    expect(reaction?.attention).toBe(true)
  })

  it('holds its cooldown, so one lull does not repeat', () => {
    const clock = fixedClock()
    const matcher = matcherAt(clock.now)
    expect(matcher.idleLine()).not.toBeNull()
    clock.advance(1000)
    expect(matcher.idleLine()).toBeNull()
    clock.advance(30_001)
    expect(matcher.idleLine()).not.toBeNull()
  })

  it('draws from the authored idle phrases', () => {
    const idle = COMPANION_TRIGGERS.find((t) => t.id === 'idle')!
    expect(idle.lines).toContainEqual(matcherAt(fixedClock().now).idleLine()?.line)
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
