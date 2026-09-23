export type CompanionEmote = 'thinking' | 'running' | 'happy' | 'proud' | 'confused' | 'hurt' | 'waiting'

/**
 * Two ways of saying the same thing. `bare` is used while one project keeps
 * talking, `named` when the speaker changes or she has been quiet, so the
 * project is identified without repeating its name on every single utterance.
 * `named` carries a {project} slot rather than a prefix, so the name lands
 * where the sentence actually wants it.
 */
export interface CompanionLine {
  bare: string
  named: string
}

export interface CompanionPokeReaction {
  tier: number
  emote: CompanionEmote
  line: CompanionLine
}

/** Something that happened on the SDLC board, already worded: every one names its ticket and project. */
export interface CompanionAnnouncement {
  emote: CompanionEmote
  text: string
}
