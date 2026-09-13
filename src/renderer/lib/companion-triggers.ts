import { COMPANION_TRIGGERS, type CompanionEmote, type CompanionTrigger } from '@/config/companion-trigger-registry'
import { COMPANION_POKES, POKE_RESET_MS } from '@/config/companion-poke-registry'
import { stripAnsi } from '@/lib/terminal-output-tidy'

export interface CompanionReaction {
  triggerId: string
  emote: CompanionEmote
  line: string
  soundId?: string
}

export interface CompanionMatcherOptions {
  now?: () => number
  pick?: (count: number) => number
  globalCooldownMs?: number
}

const DEFAULT_PICK = (count: number): number => Math.floor(Math.random() * count)

/**
 * Play-by-play fires on ordinary tool calls, which in real sessions arrive in
 * bursts, so a floor between any two lines matters more than the per-trigger
 * cooldowns alone.
 */
export const DEFAULT_GLOBAL_COOLDOWN_MS = 9000

/** How long an authored [TLDR] line keeps regex chatter quiet around it. */
export const MARKER_SUPPRESSION_MS = 8000

/**
 * Stateful because every rule that keeps this from being annoying needs history:
 * per-trigger cooldowns, a global floor between lines, deference to an authored
 * marker, and never handing back the same line twice in a row.
 */
export class CompanionMatcher {
  private readonly lastFiredAt = new Map<string, number>()
  private readonly lastLineIndex = new Map<string, number>()
  private readonly now: () => number
  private readonly pick: (count: number) => number
  private readonly globalCooldownMs: number
  private lastAnyFiredAt = -Infinity
  private suppressedUntil = -Infinity
  private pokeTier = -1
  private lastPokedAt = -Infinity

  constructor(
    private readonly triggers: CompanionTrigger[] = COMPANION_TRIGGERS,
    options: CompanionMatcherOptions = {}
  ) {
    this.now = options.now ?? Date.now
    this.pick = options.pick ?? DEFAULT_PICK
    this.globalCooldownMs = options.globalCooldownMs ?? DEFAULT_GLOBAL_COOLDOWN_MS
  }

  /**
   * The agent just spoke for itself. Its line is context-aware in a way a regex
   * guess is not, so the matcher stands down rather than talking over it.
   */
  suppress(forMs: number = MARKER_SUPPRESSION_MS): void {
    this.suppressedUntil = this.now() + forMs
    this.lastAnyFiredAt = this.now()
  }

  match(rawLine: string): CompanionReaction | null {
    const line = stripAnsi(rawLine).trimEnd()
    const at = this.now()

    if (at < this.suppressedUntil) return null
    if (at - this.lastAnyFiredAt < this.globalCooldownMs) return null

    for (const trigger of this.triggers) {
      if (!trigger.pattern.test(line)) continue

      const last = this.lastFiredAt.get(trigger.id)
      if (last !== undefined && at - last < trigger.cooldownMs) return null

      this.lastFiredAt.set(trigger.id, at)
      this.lastAnyFiredAt = at
      return {
        triggerId: trigger.id,
        emote: trigger.emote,
        line: this.nextLine(trigger),
        soundId: trigger.soundId
      }
    }

    return null
  }

  /**
   * How long she has been quiet, so an ambient idle gesture can defer to the
   * same floor that governs spoken lines rather than keeping its own clock and
   * fidgeting over the top of a reaction that just landed.
   */
  quietForMs(): number {
    return this.now() - Math.max(this.lastAnyFiredAt, this.suppressedUntil - MARKER_SUPPRESSION_MS)
  }

  /**
   * A click is the user asking for a reaction, so it ignores the cooldowns that
   * govern unprompted chatter. It still claims the floor afterwards, to stop a
   * regex line landing on top of the poke.
   */
  poke(): CompanionReaction {
    const at = this.now()
    const tier = at - this.lastPokedAt > POKE_RESET_MS ? 0 : Math.min(this.pokeTier + 1, COMPANION_POKES.length - 1)
    this.pokeTier = tier
    this.lastPokedAt = at
    this.lastAnyFiredAt = at

    const poke = COMPANION_POKES[tier]
    const key = `poke:${tier}`
    return {
      triggerId: key,
      emote: poke.emote,
      line: this.nextFrom(key, poke.lines)
    }
  }

  private nextLine(trigger: CompanionTrigger): string {
    return this.nextFrom(trigger.id, trigger.lines)
  }

  private nextFrom(key: string, lines: string[]): string {
    if (lines.length === 1) return lines[0]

    const previous = this.lastLineIndex.get(key)
    let index = this.pick(lines.length)
    if (index === previous) index = (index + 1) % lines.length

    this.lastLineIndex.set(key, index)
    return lines[index]
  }
}
