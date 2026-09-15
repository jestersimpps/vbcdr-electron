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
  plan: string
  diff: string
}

const PROMPT_VARIABLE = /\{\{(\w+)\}\}/g

function isPromptVariable(key: string, vars: SdlcPromptVariables): key is keyof SdlcPromptVariables {
  return Object.prototype.hasOwnProperty.call(vars, key)
}

/**
 * One pass, so a value that itself contains `{{...}}` is never re-expanded.
 * Unknown tokens are left verbatim: a typo in the prompt editor should be
 * visible in the terminal, not silently become a hole.
 */
export function interpolatePrompt(template: string, vars: SdlcPromptVariables): string {
  return template.replace(PROMPT_VARIABLE, (token: string, key: string) =>
    isPromptVariable(key, vars) ? vars[key] : token
  )
}
