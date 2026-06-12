import { stripAnsi } from '@/lib/terminal-output-tidy'

export { stripAnsi }

export const TOKEN_RE = /(\d[\d,.]*)\s*tokens?/

export function parseTokenCount(line: string): number | null {
  const m = TOKEN_RE.exec(line)
  if (!m) return null
  return parseInt(m[1].replace(/[,.]/g, ''), 10)
}

export const MEANINGFUL_OUTPUT_MIN_CHARS = 2
export const NON_CONTENT_CHARS_RE = /[\s​-‏‪-‮⁠﻿\x00-\x08\x0B-\x1F\x7F]/g

export function isMeaningfulOutput(data: string): boolean {
  if (!data) return false
  const stripped = stripAnsi(data).replace(NON_CONTENT_CHARS_RE, '')
  return stripped.length >= MEANINGFUL_OUTPUT_MIN_CHARS
}
