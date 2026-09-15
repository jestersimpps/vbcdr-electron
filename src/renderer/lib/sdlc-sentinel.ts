import { SDLC_SENTINEL_RELATIVE } from '@/models/sdlc-prompts'

export function sentinelPath(worktreePath: string): string {
  return `${worktreePath}/${SDLC_SENTINEL_RELATIVE}`
}

export async function readSentinel(worktreePath: string): Promise<string | null> {
  try {
    const result = await window.api.fs.readFile(sentinelPath(worktreePath))
    const content = result.content.trim()
    return content || null
  } catch {
    return null
  }
}

export async function clearSentinel(worktreePath: string): Promise<void> {
  try {
    await window.api.fs.deleteFile(sentinelPath(worktreePath))
  } catch {
    /* nothing to clear */
  }
}
