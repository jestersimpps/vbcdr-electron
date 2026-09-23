import type { SdlcPromptSegment } from '@/models/sdlc-prompts'

export function conflictResolutionInstruction(paths: string[]): string {
  const files = paths.join(', ')
  return `Resolve the merge conflicts in these files: ${files}. Read each file, understand both sides, and apply the correct resolution. Then mark them as resolved with git add.`
}

export function closeWorkflowInstruction(template: string, branch: string): string {
  return template.replace(/\{branch\}/g, branch)
}

export interface SdlcPromptVariables {
  title: string
  description: string
  branch: string
  worktreePath: string
  projectPath: string
  diff: string
  /** The branch's pull request as `<url> (<state>)`, so a prompt can skip work a PR already covers. */
  pr: string
  /** Earlier columns' results, read as `{{output.<columnId>}}`. */
  outputs: Record<string, string>
}

export const SDLC_PROMPT_VARIABLES = ['title', 'description', 'branch', 'worktreePath', 'projectPath', 'diff', 'pr'] as const

export const OUTPUT_VARIABLE_PREFIX = 'output.'

const PROMPT_VARIABLE = /\{\{([\w.-]+)\}\}/g

function promptValue(key: string, vars: SdlcPromptVariables): string | undefined {
  if (key.startsWith(OUTPUT_VARIABLE_PREFIX)) return vars.outputs[key.slice(OUTPUT_VARIABLE_PREFIX.length)]
  return (SDLC_PROMPT_VARIABLES as readonly string[]).includes(key)
    ? vars[key as (typeof SDLC_PROMPT_VARIABLES)[number]]
    : undefined
}

/** Splits a template so an editor can colour the tokens `interpolatePrompt` would fill and flag the ones it would leave verbatim. */
export function promptSegments(template: string, available: readonly string[]): SdlcPromptSegment[] {
  const segments: SdlcPromptSegment[] = []
  let last = 0
  for (const match of template.matchAll(PROMPT_VARIABLE)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ text: template.slice(last, start) })
    segments.push({ text: match[0], variable: available.includes(match[1]) ? 'known' : 'unknown' })
    last = start + match[0].length
  }
  if (last < template.length) segments.push({ text: template.slice(last) })
  return segments
}

export function promptUsesVariable(template: string, name: string): boolean {
  return template.includes(`{{${name}}}`)
}

/**
 * One pass, so a value that itself contains `{{...}}` is never re-expanded.
 * Unknown tokens are left verbatim: a typo in the prompt editor should be
 * visible in the terminal, not silently become a hole.
 */
export function interpolatePrompt(template: string, vars: SdlcPromptVariables): string {
  return template.replace(PROMPT_VARIABLE, (token: string, key: string) => promptValue(key, vars) ?? token)
}
