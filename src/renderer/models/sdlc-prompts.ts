import type { SdlcStage } from '@/models/sdlc'

/** Backlog is the human's: the raw request is the ticket. The first agent touch is planning. */
export type SdlcHandoffStage = Exclude<SdlcStage, 'backlog' | 'done'>

export type SdlcStagePrompts = Record<SdlcHandoffStage, string>

export interface SdlcPromptResolution {
  text: string
  overridden: boolean
}

export const SDLC_HANDOFF_STAGES: readonly SdlcHandoffStage[] = ['planning', 'implementing', 'review']

export function isHandoffStage(stage: SdlcStage): stage is SdlcHandoffStage {
  return stage === 'planning' || stage === 'implementing' || stage === 'review'
}

export const SDLC_SENTINEL_DIR = '.vbcdr'
export const SDLC_SENTINEL_FILE = 'stage-output.md'
export const SDLC_SENTINEL_RELATIVE = `${SDLC_SENTINEL_DIR}/${SDLC_SENTINEL_FILE}`
export const SDLC_PLAN_RELATIVE = `${SDLC_SENTINEL_DIR}/plan.md`

export const EMPTY_PROMPT_VALUE = '(none)'

/** Stored prompts survive only if they are non-blank strings; anything else falls back per stage. */
export function sanitizeStagePrompts(value: unknown): SdlcStagePrompts {
  const incoming = (value ?? {}) as Partial<Record<SdlcHandoffStage, unknown>>
  const out = { ...DEFAULT_SDLC_STAGE_PROMPTS }
  for (const stage of SDLC_HANDOFF_STAGES) {
    const candidate = incoming[stage]
    if (typeof candidate === 'string' && candidate.trim()) out[stage] = candidate
  }
  return out
}

export const SENTINEL_CLAUSE = `When you are completely finished, write your full result to ${SDLC_SENTINEL_RELATIVE} inside the worktree, creating the folder if needed. Do not write that file until everything above is done: it is the signal that this stage is complete.`

export const DEFAULT_SDLC_STAGE_PROMPTS: SdlcStagePrompts = {
  planning: `Write an implementation plan for this ticket in the worktree at {{worktreePath}} (branch {{branch}}).

Title: {{title}}
Description:
{{description}}

Explore the codebase first and base the plan on existing patterns and conventions rather than inventing new ones. Write the plan as a markdown document: a short context section, then an ordered list of concrete steps, each naming the files it touches, plus the tests or checks that will prove the change works. Flag anything that looks risky or underspecified. Do not modify any files yet: this stage produces the plan only.

${SENTINEL_CLAUSE}`,

  implementing: `Implement this ticket in the worktree at {{worktreePath}} on branch {{branch}}.

Title: {{title}}
Description:
{{description}}

Agreed plan (also saved at ${SDLC_PLAN_RELATIVE} in the worktree):
{{plan}}

Follow the plan. If you discover it is wrong, stop and explain the problem instead of silently doing something different. Match the conventions of the surrounding code. When the code is complete, run the project's typecheck, lint and tests, and fix what you broke. Commit your work on this branch with clear messages, but do not push and do not open a pull request. Report what you changed and the final state of the checks.

${SENTINEL_CLAUSE}`,

  review: `Review the change on branch {{branch}} in the worktree at {{worktreePath}} before it is merged.

Title: {{title}}
Description:
{{description}}

Diff under review:
{{diff}}

Check it against the ticket's intent: correctness, missed edge cases, anything that contradicts existing patterns, and anything left unfinished or stubbed. Verify the tests actually cover the new behaviour. Report findings as a prioritised list separating blocking issues from nits. Do not fix anything: this stage reports only.

${SENTINEL_CLAUSE}`
}
