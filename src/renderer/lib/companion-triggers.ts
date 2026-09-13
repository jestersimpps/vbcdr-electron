import { COMPANION_TRIGGERS, type CompanionEmote, type CompanionTrigger } from '@/config/companion-trigger-registry'
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
}

const DEFAULT_PICK = (count: number): number => Math.floor(Math.random() * count)

/**
 * Stateful because both rules that keep this from being annoying need history:
 * a per-trigger cooldown, and never handing back the same line twice in a row.
 */
export class CompanionMatcher {
  private readonly lastFiredAt = new Map<string, number>()
  private readonly lastLineIndex = new Map<string, number>()
  private readonly now: () => number
  private readonly pick: (count: number) => number

  constructor(
    private readonly triggers: CompanionTrigger[] = COMPANION_TRIGGERS,
    options: CompanionMatcherOptions = {}
  ) {
    this.now = options.now ?? Date.now
    this.pick = options.pick ?? DEFAULT_PICK
  }

  match(rawLine: string): CompanionReaction | null {
    const line = stripAnsi(rawLine).trimEnd()
    const at = this.now()

    for (const trigger of this.triggers) {
      if (!trigger.pattern.test(line)) continue

      const last = this.lastFiredAt.get(trigger.id)
      if (last !== undefined && at - last < trigger.cooldownMs) return null

      this.lastFiredAt.set(trigger.id, at)
      return {
        triggerId: trigger.id,
        emote: trigger.emote,
        line: this.nextLine(trigger),
        soundId: trigger.soundId
      }
    }

    return null
  }

  private nextLine(trigger: CompanionTrigger): string {
    const { lines } = trigger
    if (lines.length === 1) return lines[0]

    const previous = this.lastLineIndex.get(trigger.id)
    let index = this.pick(lines.length)
    if (index === previous) index = (index + 1) % lines.length

    this.lastLineIndex.set(trigger.id, index)
    return lines[index]
  }
}
