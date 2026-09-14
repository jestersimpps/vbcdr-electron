import {
  COMPANION_TRIGGERS,
  type CompanionEmote,
  type CompanionLine,
  type CompanionTier,
  type CompanionTrigger
} from '@/config/companion-trigger-registry'
import { COMPANION_POKES, POKE_RESET_MS } from '@/config/companion-poke-registry'
import { stripAnsi } from '@/lib/terminal-output-tidy'

export interface CompanionReaction {
  triggerId: string
  emote: CompanionEmote
  /**
   * Both phrasings of the chosen line. The caller decides which to speak, since
   * only it knows whether this project was the last one talking.
   */
  line: CompanionLine
  soundId?: string
  /** The run has stopped and needs you, so callers may treat it as urgent. */
  attention?: boolean
  /**
   * Below the chattiness floor: play the gesture, say nothing. She still reacts
   * to the work, she just stops commentating on it.
   */
  silent?: boolean
}

export interface CompanionMatcherOptions {
  now?: () => number
  pick?: (count: number) => number
  globalCooldownMs?: number
  /** Quietest tier she is allowed to speak. Anything below it still gestures. */
  floor?: CompanionTier
}

/**
 * How talkative she is, quietest first. A level admits its own tier and every
 * tier above it, so `outcome` speaks outcomes and attention but not chatter.
 */
export const CHATTINESS_LEVELS = ['attention', 'outcome', 'chatter'] as const

export type CompanionChattiness = (typeof CHATTINESS_LEVELS)[number]

export const DEFAULT_CHATTINESS: CompanionChattiness = 'outcome'

const TIER_RANK: Record<CompanionTier, number> = { attention: 0, outcome: 1, chatter: 2 }

/** Whether a tier is loud enough to be spoken at this level. */
export function tierSpeaksAt(tier: CompanionTier, level: CompanionChattiness): boolean {
  return TIER_RANK[tier] <= TIER_RANK[level]
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
  private floor: CompanionChattiness

  constructor(
    private readonly triggers: CompanionTrigger[] = COMPANION_TRIGGERS,
    options: CompanionMatcherOptions = {}
  ) {
    this.now = options.now ?? Date.now
    this.pick = options.pick ?? DEFAULT_PICK
    this.globalCooldownMs = options.globalCooldownMs ?? DEFAULT_GLOBAL_COOLDOWN_MS
    this.floor = options.floor ?? DEFAULT_CHATTINESS
  }

  /** Changing the setting takes effect on the next line, without a remount. */
  setChattiness(level: CompanionChattiness): void {
    this.floor = level
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

    // The quiet rules are checked per trigger rather than up front, so a line
    // that means "you are being waited on" can still get through a floor that
    // ordinary play-by-play is correctly held behind.
    const quiet = at >= this.suppressedUntil && at - this.lastAnyFiredAt >= this.globalCooldownMs

    for (const trigger of this.triggers) {
      if (!trigger.pattern.test(line)) continue
      // Below the floor she still feels it: the caller gets a silent reaction and
      // plays the gesture, so she reacts to the work without narrating it.
      const silent = !tierSpeaksAt(trigger.tier, this.floor)
      if (!quiet && !trigger.attention && !silent) return null

      // Its own cooldown still applies: the prompt box repaints on every buffer
      // tick, and without this she would announce it on each one.
      const last = this.lastFiredAt.get(trigger.id)
      if (last !== undefined && at - last < trigger.cooldownMs) return null

      this.lastFiredAt.set(trigger.id, at)
      // A silent reaction does not claim the floor: it costs no words, so it must
      // not buy the quiet that a spoken line earns.
      if (!silent) this.lastAnyFiredAt = at
      return {
        triggerId: trigger.id,
        emote: trigger.emote,
        line: this.nextLine(trigger),
        soundId: silent ? undefined : trigger.soundId,
        attention: trigger.attention,
        silent
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

  /**
   * The line for having gone quiet. Going idle is the absence of output rather
   * than a line of it, so no pattern can catch it and the caller drives this off
   * a timer instead. Returns null if the registry has no idle trigger.
   */
  idleLine(): CompanionReaction | null {
    const trigger = this.triggers.find((t) => t.id === 'idle')
    if (!trigger) return null

    const at = this.now()
    const last = this.lastFiredAt.get(trigger.id)
    if (last !== undefined && at - last < trigger.cooldownMs) return null

    this.lastFiredAt.set(trigger.id, at)
    this.lastAnyFiredAt = at
    return {
      triggerId: trigger.id,
      emote: trigger.emote,
      line: this.nextLine(trigger),
      soundId: trigger.soundId,
      attention: true
    }
  }

  private nextLine(trigger: CompanionTrigger): CompanionLine {
    return this.nextFrom(trigger.id, trigger.lines)
  }

  private nextFrom(key: string, lines: CompanionLine[]): CompanionLine {
    if (lines.length === 1) return lines[0]

    const previous = this.lastLineIndex.get(key)
    let index = this.pick(lines.length)
    if (index === previous) index = (index + 1) % lines.length

    this.lastLineIndex.set(key, index)
    return lines[index]
  }
}
