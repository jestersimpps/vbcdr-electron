import { stripAnsi } from '@/lib/terminal-text'
import type { CompanionGesture } from '@/components/companion/companion-gestures'

export const MARKER_OPEN = '[TLDR]>'
export const MARKER_CLOSE = '<[TLDR]'

const MARKER_RE = /\[TLDR\]>([^<]*)<\[TLDR\]/g
const MAX_TEXT = 120
const MAX_PENDING = 4096

const GESTURE_NAMES: CompanionGesture[] = [
  'acknowledge',
  'thinkingAside',
  'perkUp',
  'affirm',
  'wince',
  'consider'
]

export interface CompanionMarker {
  gesture: CompanionGesture | null
  text: string
}

function sanitize(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
}

function toGesture(value: string): CompanionGesture | null {
  const needle = value.trim().toLowerCase()
  return GESTURE_NAMES.find((g) => g.toLowerCase() === needle) ?? null
}

export function parseMarkerBody(body: string): CompanionMarker | null {
  const pipe = body.indexOf('|')
  const gesture = pipe >= 0 ? toGesture(body.slice(0, pipe)) : null
  const text = sanitize(pipe >= 0 ? body.slice(pipe + 1) : body)
  if (!text && !gesture) return null
  return { gesture, text }
}

export class CompanionMarkerScanner {
  private pending = ''

  push(chunk: string): CompanionMarker[] {
    this.pending += stripAnsi(chunk)

    const found: CompanionMarker[] = []
    MARKER_RE.lastIndex = 0
    let match: RegExpExecArray | null
    let consumedTo = 0

    while ((match = MARKER_RE.exec(this.pending)) !== null) {
      const parsed = parseMarkerBody(match[1])
      if (parsed) found.push(parsed)
      consumedTo = match.index + match[0].length
    }

    if (consumedTo > 0) this.pending = this.pending.slice(consumedTo)

    const openAt = this.pending.lastIndexOf(MARKER_OPEN)
    if (openAt < 0) {
      this.pending = this.pending.slice(-MARKER_OPEN.length)
    } else if (this.pending.length - openAt > MAX_PENDING) {
      this.pending = ''
    } else {
      this.pending = this.pending.slice(openAt)
    }

    return found
  }

  reset(): void {
    this.pending = ''
  }
}

export function stripMarkers(text: string): string {
  return text.replace(MARKER_RE, '')
}
