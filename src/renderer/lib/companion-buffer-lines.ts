import { stripAnsi } from '@/lib/terminal-output-tidy'

/**
 * The LLM buffer scan re-sends every visible row on each tick, so the same line
 * arrives many times while the screen sits still. Only rows that were not in the
 * previous scan are new output.
 */
const MAX_REMEMBERED = 400

/**
 * Spinner and status-bar chrome repaints constantly: across 113k lines of real
 * captured scrollback, "tokens" appeared 1696 times and "thinking" 667 against
 * two occurrences of "Exit code 1". Matching these would drown out everything.
 */
const NOISE_RE =
  /(?:esc to interrupt|tokens\b|·\s*↓|Working…|Thinking…|shift\+tab|auto mode on|accept edits|\d+%\s*context|^\s*[─━═┄┈│╭╮╰╯├┤┬┴┼]+\s*$|^\s*❯\s*$)/i

/** Box-drawing borders and prompt gutters survive translateToString as padding. */
const GUTTER_RE = /^[\s│╎┆┊>❯]+|[\s│╎┆┊]+$/g

export function isNoiseLine(line: string): boolean {
  return NOISE_RE.test(line)
}

export function normalizeBufferLine(raw: string): string {
  return stripAnsi(raw).replace(GUTTER_RE, '').trim()
}

/**
 * Turns repeated whole-screen scans into a stream of lines seen for the first
 * time. Keyed per terminal tab because two agents run side by side.
 */
export class CompanionLineFeed {
  private readonly seen = new Map<string, Set<string>>()
  private readonly order = new Map<string, string[]>()

  push(tabId: string, rows: string[]): string[] {
    let seen = this.seen.get(tabId)
    let order = this.order.get(tabId)
    if (!seen || !order) {
      seen = new Set()
      order = []
      this.seen.set(tabId, seen)
      this.order.set(tabId, order)
    }

    const fresh: string[] = []
    for (const row of rows) {
      const line = normalizeBufferLine(row)
      if (!line || line.length < 3) continue
      if (seen.has(line)) continue

      seen.add(line)
      order.push(line)
      if (!isNoiseLine(line)) fresh.push(line)
    }

    while (order.length > MAX_REMEMBERED) {
      const dropped = order.shift()
      if (dropped !== undefined) seen.delete(dropped)
    }

    return fresh
  }

  forget(tabId: string): void {
    this.seen.delete(tabId)
    this.order.delete(tabId)
  }

  reset(): void {
    this.seen.clear()
    this.order.clear()
  }
}
