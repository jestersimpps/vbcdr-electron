import path from 'path'
import os from 'os'

export function claudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

/**
 * Claude Code stores each project's transcripts under a directory named after the
 * absolute project path with every non-alphanumeric character replaced by a dash.
 * Dots and underscores are sanitized too, so `~/Sites/my_app.v2` becomes
 * `-Users-me-Sites-my-app-v2`.
 */
export function claudeProjectSlug(projectPath: string): string {
  return path.resolve(projectPath).replace(/[^a-zA-Z0-9]/g, '-')
}

export function claudeProjectDir(projectPath: string): string {
  return path.join(claudeProjectsDir(), claudeProjectSlug(projectPath))
}
