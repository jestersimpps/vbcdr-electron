import { DEFAULT_IDLE_SOUND_ID } from '@/config/sound-registry'

export type CompanionEmote =
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'searching'
  | 'running'
  | 'happy'
  | 'proud'
  | 'confused'
  | 'hurt'
  | 'sheepish'
  | 'waiting'
  | 'sleeping'

export interface CompanionTrigger {
  id: string
  pattern: RegExp
  emote: CompanionEmote
  soundId?: string
  lines: string[]
  cooldownMs: number
}

/**
 * Patterns are matched against ANSI-stripped single lines. Ordered by priority:
 * the first match wins, so failures sit above the tool chatter that precedes them.
 */
export const COMPANION_TRIGGERS: CompanionTrigger[] = [
  {
    id: 'permission-denied',
    pattern: /Permission to use \w+ .*has been denied|user doesn't want to (?:take|proceed)/i,
    emote: 'hurt',
    soundId: 'interface-back',
    cooldownMs: 8000,
    lines: [
      'ok, hands off. you drive',
      'denied. noted, not retrying that',
      'fair enough, that one was yours to call',
      'backing off the thing you just blocked',
      'right, I will stop reaching for that'
    ]
  },
  {
    id: 'command-failed',
    pattern: /^(?:Exit code (?!0)\d+|fatal: |error: |\S*Error: )/,
    emote: 'confused',
    soundId: 'interface-back',
    cooldownMs: 6000,
    lines: [
      'that exploded, reading the trace',
      'nope. something is upset',
      'ok that did not go how I wanted',
      'red output. investigating',
      'hit a wall, working out which one',
      'broke it. on purpose? unclear'
    ]
  },
  {
    id: 'no-matches',
    pattern: /no matches found|command not found|No such file or directory/i,
    emote: 'sheepish',
    cooldownMs: 9000,
    lines: [
      'my glob was wrong, not the repo',
      'searched for something that is not there',
      'that was a typo in my own command',
      'wrong shell quoting again. my bad',
      'zsh disagrees with how I wrote that'
    ]
  },
  {
    id: 'reading-file',
    pattern: /^(?:⏺\s*)?Read\(|^\s*Reading \S+/,
    emote: 'reading',
    cooldownMs: 2500,
    lines: [
      'skimming this one',
      'eyes on the file',
      'reading before touching anything',
      'loading context',
      'having a look at what is actually there',
      'checking the source instead of guessing'
    ]
  },
  {
    id: 'editing-file',
    pattern: /^(?:⏺\s*)?(?:Edit|Write|Update)\(|^\s*(?:Applied|Wrote) \d+ /,
    emote: 'writing',
    soundId: 'bubble-pop',
    cooldownMs: 2500,
    lines: [
      'putting the change in',
      'editing. carefully, mostly',
      'one file, one line, fingers crossed',
      'writing it down',
      'making the actual change now',
      'touching source. this is the real part'
    ]
  },
  {
    id: 'searching',
    pattern: /^(?:⏺\s*)?(?:Grep|Glob|Search)\(|^\s*grep -/,
    emote: 'searching',
    cooldownMs: 3000,
    lines: [
      'grepping the haystack',
      'hunting for where this lives',
      'sweeping the tree',
      'looking for the seam',
      'searching. wide net first',
      'finding out if this exists at all'
    ]
  },
  {
    id: 'running-command',
    pattern: /^(?:⏺\s*)?Bash\(|^\s*(?:npm|npx|yarn|pnpm) (?:run |exec )?\S+/,
    emote: 'running',
    cooldownMs: 3000,
    lines: [
      'shelling out',
      'running it and watching',
      'let us see what the machine says',
      'command away',
      'firing this off',
      'hoping the exit code is zero'
    ]
  },
  {
    id: 'typecheck-clean',
    pattern: /tsc --noEmit.*\n?$|^\s*(?:Found 0 errors|No errors found)/,
    emote: 'proud',
    soundId: 'correct-tone',
    cooldownMs: 10000,
    lines: [
      'typechecker is happy',
      'clean. genuinely clean',
      'zero errors, I will take it',
      'types agree with me for once',
      'no complaints from tsc'
    ]
  },
  {
    id: 'tests-passed',
    pattern: /\b(\d+) (?:passed|passing)\b|✓\s+\d+ tests?/i,
    emote: 'happy',
    soundId: 'correct-tone',
    cooldownMs: 8000,
    lines: [
      'green. all of it',
      'tests pass, we are fine',
      'that is the good colour',
      'suite is happy',
      'passed. moving on'
    ]
  },
  {
    id: 'tests-failed',
    pattern: /\b(\d+) (?:failed|failing)\b|✗\s+\d+ tests?|FAIL\s+\S+/,
    emote: 'confused',
    soundId: 'interface-back',
    cooldownMs: 8000,
    lines: [
      'something failed, going to look',
      'not green. my problem to fix',
      'a test disagrees with the change',
      'broke an expectation somewhere',
      'red suite. reading the failure'
    ]
  },
  {
    id: 'git-commit',
    pattern: /^\[[\w./-]+ [0-9a-f]{7,}\]|^\s*\d+ files? changed/,
    emote: 'proud',
    soundId: 'confirmation',
    cooldownMs: 5000,
    lines: [
      'committed. that one is safe now',
      'snapshot taken',
      'on the record',
      'saved to history',
      'that is locked in'
    ]
  },
  {
    id: 'long-thinking',
    pattern: /^(?:Let me|I need to|Before (?:firing|writing)|Privately,|What I (?:still )?need)/,
    emote: 'thinking',
    cooldownMs: 4000,
    lines: [
      'working out the order of this',
      'thinking before typing',
      'planning the next couple of moves',
      'figuring out what I actually need',
      'holding on, reasoning',
      'deciding what matters here'
    ]
  },
  {
    id: 'admitting-wrong',
    pattern: /\bI was wrong\b|\bmy (?:mistake|bad)\b|\bI (?:mis)?read (?:the|that) wrong\b|contradicts what I/i,
    emote: 'sheepish',
    soundId: 'interface-hint',
    cooldownMs: 12000,
    lines: [
      'ok that was me, not the code',
      'wrong twice, saying so out loud',
      'I had that backwards',
      'correcting myself, sorry',
      'bad call earlier. fixing the reasoning'
    ]
  },
  {
    id: 'asking-user',
    pattern: /\b(?:Which do you want|Tell me which|pick one|your call|say the word)\b/i,
    emote: 'waiting',
    soundId: 'message-pop',
    cooldownMs: 6000,
    lines: [
      'need you for this bit',
      'your call, not mine',
      'handing it back',
      'waiting on a decision',
      'this one needs a human'
    ]
  },
  {
    id: 'idle',
    pattern: /^$/,
    emote: 'sleeping',
    soundId: DEFAULT_IDLE_SOUND_ID,
    cooldownMs: 30000,
    lines: [
      'done for now',
      'idle. ping me',
      'standing by',
      'nothing left in the queue',
      'resting until you need something'
    ]
  }
]
