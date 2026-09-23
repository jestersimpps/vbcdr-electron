import { COMPANION_POKES, POKE_RESET_MS } from '@/config/companion-poke-registry'
import type { CompanionLine, CompanionPokeReaction } from '@/models/companion'

const DEFAULT_PICK = (count: number): number => Math.floor(Math.random() * count)

/** A run of clicks escalates tier by tier; a quiet gap softens her back to the first. */
export class CompanionPoker {
  private readonly lastLineIndex = new Map<number, number>()
  private tier = -1
  private lastPokedAt = -Infinity

  constructor(
    private readonly now: () => number = Date.now,
    private readonly pick: (count: number) => number = DEFAULT_PICK
  ) {}

  poke(): CompanionPokeReaction {
    const at = this.now()
    this.tier = at - this.lastPokedAt > POKE_RESET_MS ? 0 : Math.min(this.tier + 1, COMPANION_POKES.length - 1)
    this.lastPokedAt = at
    const poke = COMPANION_POKES[this.tier]
    return { tier: this.tier, emote: poke.emote, line: this.nextLine(this.tier, poke.lines) }
  }

  private nextLine(tier: number, lines: CompanionLine[]): CompanionLine {
    if (lines.length === 1) return lines[0]
    const previous = this.lastLineIndex.get(tier)
    let index = this.pick(lines.length)
    if (index === previous) index = (index + 1) % lines.length
    this.lastLineIndex.set(tier, index)
    return lines[index]
  }
}
