import { ACTION_SPECS } from '@/lib/app-actions'

export interface AgentAction {
  action: string
  target?: string
  say?: string
}

export const DICTATE_ACTION = 'dictate'

/**
 * MUST be a single line with no newlines: the PTY treats every "\n" as a submit,
 * so a multi-line preamble is sent as N separate prompts and the agent answers each.
 *
 * It also must not read as a request. An earlier version ended with an example
 * ({"action":"dictate","target":"<the text verbatim>"}) and the agent dutifully
 * replied with that placeholder filled in literally, before any speech existed.
 * Hence the explicit "acknowledge with READY and then wait" ending.
 */
export function buildProtocolPreamble(): string {
  const actions = [...Object.keys(ACTION_SPECS), DICTATE_ACTION].sort().join(', ')
  return [
    'SETUP (not a request — do not act on it yet).',
    'For every LATER message I send, reply with exactly ONE line of JSON and nothing else,',
    'shaped {"action":"<name>","target":"<optional string>"}.',
    `Valid action names: ${actions}.`,
    'target is a human string: a project name, a file name, an ordinal such as "second", a branch, or a theme.',
    'Each later message carries a [state] block listing what currently exists; resolve target against it.',
    'When a name matches both a full-screen page and a center tab, prefer the center tab if a project is active.',
    'When a message is not a navigation command, use the action name dictate and put the message text in target.',
    'Never explain, never add prose, never use markdown fences.',
    'Reply to THIS setup message with the single word READY and nothing else, then wait.'
  ].join(' ')
}

const ANSI_PATTERN =
  // OSC (ESC ] … BEL/ST), then CSI INCLUDING private parameter bytes (<=>?),
  // then two-byte escapes. Codex emits kitty-keyboard sequences like ESC[>4;0m
  // and ESC[>7u — without the private-byte class those leave "4;0m" behind.
  // eslint-disable-next-line no-control-regex
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;:<=>?]*[ -\/]*[@-~]|\x1b[()][A-B0-9]|\x1b[@-Z\\-_]/g

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '')
}

const BOX_DRAWING_PATTERN = /[─-╿▀-▟]/g

export function cleanLine(line: string): string {
  return stripAnsi(line).replace(BOX_DRAWING_PATTERN, '').replace(/\r/g, '').trim()
}

export function extractJsonObject(line: string): unknown | null {
  const cleaned = cleanLine(line)
  if (!cleaned) return null

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  const candidate = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

export function parseAgentAction(line: string): AgentAction | null {
  const parsed = extractJsonObject(line)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const obj = parsed as Record<string, unknown>
  if (typeof obj.action !== 'string' || !obj.action.trim()) return null

  const action: AgentAction = { action: obj.action.trim() }
  if (typeof obj.target === 'string' && obj.target.trim()) action.target = obj.target.trim()
  if (typeof obj.say === 'string' && obj.say.trim()) action.say = obj.say.trim()
  return action
}

export function isKnownAction(action: string): boolean {
  return action === DICTATE_ACTION || action in ACTION_SPECS
}

export class AgentLineBuffer {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk
    const parts = this.buffer.split('\n')
    this.buffer = parts.pop() ?? ''
    return parts
  }

  flush(): string {
    const remaining = this.buffer
    this.buffer = ''
    return remaining
  }
}
