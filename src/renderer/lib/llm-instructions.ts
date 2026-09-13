export function conflictResolutionInstruction(paths: string[]): string {
  const files = paths.join(', ')
  return `Resolve the merge conflicts in these files: ${files}. Read each file, understand both sides, and apply the correct resolution. Then mark them as resolved with git add.`
}

export function closeWorkflowInstruction(template: string, branch: string): string {
  return template.replace(/\{branch\}/g, branch)
}
