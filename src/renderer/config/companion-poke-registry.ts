import type { CompanionEmote } from '@/config/companion-trigger-registry'

export interface CompanionPoke {
  emote: CompanionEmote
  lines: string[]
}

/**
 * Clicking the companion escalates: the first poke is mild, a run of them gets
 * progressively less amused. The last tier repeats for as long as the clicking
 * goes on.
 */
export const COMPANION_POKES: CompanionPoke[] = [
  {
    emote: 'waiting',
    lines: [
      'that tickles',
      'yes? I am right here',
      'careful, I am load bearing',
      'you rang',
      'mm. what',
      'I felt that'
    ]
  },
  {
    emote: 'confused',
    lines: [
      'ok, stop it',
      'again? really',
      'that is twice now',
      'you are enjoying this',
      'I am trying to work here',
      'poking me does not compile anything'
    ]
  },
  {
    emote: 'hurt',
    lines: [
      'right, I am counting these',
      'this is going in the log',
      'go and read your diff instead',
      'I will remember this',
      'do you not have tests to run',
      'fine. keep going. see what happens'
    ]
  }
]

/** How long a gap resets the escalation back to the mild tier. */
export const POKE_RESET_MS = 20_000
