import { SDLC_SENTINEL_RELATIVE } from '@/models/sdlc-prompts'
import type { SdlcDoneOutcome } from '@/models/sdlc'
import type { PrState } from '@/models/types'

const OUTCOMES: readonly SdlcDoneOutcome[] = ['pr', 'merged', 'branch', 'no-pr']

/**
 * Appended to whatever the last column's prompt says, since the user can rewrite
 * that prompt freely and nothing else tells the app what it ended up doing.
 */
export const DONE_REPORT_CLAUSE = `When you are completely finished, write a short report to ${SDLC_SENTINEL_RELATIVE} inside the worktree, creating the folder if needed. Its first line must be exactly one of:
OUTCOME: pr (a pull request is open for this branch)
OUTCOME: merged (the branch has been merged)
OUTCOME: branch (the work was pushed to the branch without a pull request)
OUTCOME: no-pr (nothing was pushed and no pull request was opened)
Follow it with one or two sentences on what you did. Do not write that file until everything above is done.`

const OUTCOME_LINE = /^\s*OUTCOME:\s*([a-z-]+)/im

function reportedOutcome(report: string): SdlcDoneOutcome | null {
  const word = OUTCOME_LINE.exec(report)?.[1]?.toLowerCase()
  return OUTCOMES.find((o) => o === word) ?? null
}

/** GitHub's own view of the pull request outranks what the agent says it did; the report fills in what gh cannot see. */
export function resolveDoneOutcome(report: string, prState: PrState): SdlcDoneOutcome {
  if (prState === 'merged') return 'merged'
  if (prState === 'open') return 'pr'
  return reportedOutcome(report) ?? 'no-pr'
}

export const DONE_OUTCOME_LABELS: Record<SdlcDoneOutcome, string> = {
  pr: 'pull request open',
  merged: 'merged',
  branch: 'pushed to its branch, no pull request',
  'no-pr': 'no pull request, work kept on its branch'
}
