import { stripAnsi } from '@/lib/terminal-output-tidy'

export { stripAnsi }

export const TOKEN_RE = /(\d[\d,]*\.?\d*)\s*([km])?\s*tokens?/i

export function parseTokenCount(line: string): number | null {
  const m = TOKEN_RE.exec(line)
  if (!m) return null
  const value = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  const suffix = m[2]?.toLowerCase()
  const mult = suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1
  return Math.round(value * mult)
}

const PROMPT_MARKER_RE = /[❯%$#>]\s+/

export function extractPromptCommand(line: string): string {
  const m = PROMPT_MARKER_RE.exec(line)
  return (m ? line.slice(m.index + m[0].length) : line).trim()
}

export const MEANINGFUL_OUTPUT_MIN_CHARS = 2
export const NON_CONTENT_CHARS_RE = /[\s​-‏‪-‮⁠﻿\x00-\x08\x0B-\x1F\x7F]/g

export function isMeaningfulOutput(data: string): boolean {
  if (!data) return false
  const stripped = stripAnsi(data).replace(NON_CONTENT_CHARS_RE, '')
  return stripped.length >= MEANINGFUL_OUTPUT_MIN_CHARS
}

/**
 * Matches the CLI idioms Claude Code and Codex use for a prompt that blocks
 * on a keypress: the trust-this-folder check, tool/permission approval menus,
 * and the generic "Enter to confirm" footer they all share. Checked against a
 * rolling tail of recent output, not per-chunk, since prompts render across
 * several PTY writes.
 *
 * A bare numbered "Yes" is deliberately not enough: agents write numbered
 * plans, and one starting with "Yes" would otherwise mark the ticket blocked
 * while the agent is working fine. It must carry a menu marker or a No option.
 */
const INTERACTIVE_PROMPT_RE =
  /Enter to confirm\s*[·•|]\s*Esc to cancel|Do you want to (?:proceed|allow|continue)|Yes, I trust this folder|❯\s*\d+\.\s|^\s*\d+\.\s*Yes\b.*\n\s*\d+\.\s*No\b/im

export function looksLikeInteractivePrompt(text: string): boolean {
  if (!text) return false
  return INTERACTIVE_PROMPT_RE.test(stripAnsi(text))
}
