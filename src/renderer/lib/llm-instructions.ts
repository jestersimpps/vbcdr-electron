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
  /** Earlier columns' results, read as `{{output.<columnId>}}`. */
  outputs: Record<string, string>
}

export const SDLC_PROMPT_VARIABLES = ['title', 'description', 'branch', 'worktreePath', 'projectPath', 'diff'] as const

export const OUTPUT_VARIABLE_PREFIX = 'output.'

const PROMPT_VARIABLE = /\{\{([\w.-]+)\}\}/g

function promptValue(key: string, vars: SdlcPromptVariables): string | undefined {
  if (key.startsWith(OUTPUT_VARIABLE_PREFIX)) return vars.outputs[key.slice(OUTPUT_VARIABLE_PREFIX.length)]
  return (SDLC_PROMPT_VARIABLES as readonly string[]).includes(key)
    ? vars[key as (typeof SDLC_PROMPT_VARIABLES)[number]]
    : undefined
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
