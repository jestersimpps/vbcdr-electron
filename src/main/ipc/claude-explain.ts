import crypto from 'crypto'
import { spawn } from 'child_process'
import { safeHandle } from '@main/ipc/safe-handle'

export type DiffSource =
  | { kind: 'working' }
  | { kind: 'commit'; hash: string }
  | { kind: 'range'; from: string; to: string }

function diffArgs(source: DiffSource): string[] {
  if (source.kind === 'commit') {
    return ['show', '--no-color', '--format=', source.hash]
  }
  if (source.kind === 'range') {
    return ['diff', '--no-color', `${source.from}..${source.to}`]
  }
  return ['diff', '--no-color', 'HEAD']
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8') })
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args[0]} exited with code ${code}: ${stderr.trim()}`))
        return
      }
      resolve(stdout)
    })
  })
}

export type ExplainLevel = 'functional' | 'technical' | 'deep'

export interface DiffComment {
  line: number
  side: 'old' | 'new'
  text: string
}

export interface FileAnnotation {
  path: string
  summary?: string
  comments: DiffComment[]
}

export interface ExplainResult {
  generatedAt: string
  diffSha: string
  level: ExplainLevel
  files: FileAnnotation[]
}

export interface ExplainArgs {
  projectRoot: string
  diffText?: string
  source?: DiffSource
  level?: ExplainLevel
}

const SCHEMA = {
  type: 'object',
  required: ['files'],
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'comments'],
        properties: {
          path: { type: 'string' },
          summary: { type: 'string' },
          comments: {
            type: 'array',
            items: {
              type: 'object',
              required: ['line', 'side', 'text'],
              properties: {
                line: { type: 'integer' },
                side: { type: 'string', enum: ['old', 'new'] },
                text: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}

const DEEP_PROMPT = [
  'You are explaining a unified git diff for a code reviewer.',
  'For each non-trivial change, attach a comment to the most relevant line with the *why*, not the *what*.',
  'The line number must be the line in the *new* (post-change) file when side is "new", or the *old* file when side is "old".',
  'Skip lines whose purpose is obvious from the code itself (formatting-only changes, import reorders, simple renames, whitespace).',
  'Prefer "new" side for additions and modifications. Use "old" side only when commenting on something that was removed.',
  'Keep each comment under two sentences. Be concrete: name the constraint, the bug, the prior behavior, or the trade-off.',
  'Use the file path exactly as it appears in the diff header (e.g., "src/foo/bar.ts"), no leading "a/" or "b/".',
  'Output strictly the JSON schema. No markdown, no prose outside the schema.'
].join(' ')

const FUNCTIONAL_PROMPT = [
  'You are explaining a unified git diff to a NON-DEVELOPER (a product manager, designer, or support person).',
  'Pin each comment to the SINGLE LINE that best represents what changed for the user.',
  'Comment text MUST be plain language: describe what the user gets — new capability, fixed bug, faster behaviour, safer flow.',
  'Do NOT use code terms, identifiers, function names, file paths, types, or technical jargon. No backticks, no camelCase, no API names. Talk about *behaviour*, not *code*.',
  'Pick the most representative changed line per concept; do not annotate every line. 1-3 comments per file is the target. Skip files whose change has no user-visible effect.',
  'The line number must be the line in the *new* (post-change) file when side is "new", or the *old* file when side is "old". Prefer "new".',
  'Use the file path exactly as it appears in the diff header (e.g., "src/foo/bar.ts"), no leading "a/" or "b/".',
  'Leave `summary` empty. All content goes in `comments`.',
  'Output strictly the JSON schema. No markdown, no prose outside the schema.'
].join(' ')

const TECHNICAL_PROMPT = [
  'You are explaining a unified git diff to ANOTHER DEVELOPER reviewing the PR.',
  'Pin each comment to the line that best demonstrates a design decision.',
  'Comment text MUST focus on the *why this choice*: which pattern or approach was used, which library or API was reached for, what trade-off was accepted, what alternative was rejected and why.',
  'Skip mechanical details (renames, imports, formatting) — that is a different mode. Aim for 1-4 comments per file, only on lines that show a real decision.',
  'The line number must be the line in the *new* (post-change) file when side is "new", or the *old* file when side is "old". Prefer "new".',
  'Use the file path exactly as it appears in the diff header (e.g., "src/foo/bar.ts"), no leading "a/" or "b/".',
  'Leave `summary` empty. All content goes in `comments`.',
  'Output strictly the JSON schema. No markdown, no prose outside the schema.'
].join(' ')

function promptForLevel(level: ExplainLevel): string {
  if (level === 'functional') return FUNCTIONAL_PROMPT
  if (level === 'technical') return TECHNICAL_PROMPT
  return DEEP_PROMPT
}

function shaOf(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)
}

interface ClaudeResultEvent {
  type: 'result'
  subtype?: string
  is_error?: boolean
  result?: unknown
  structured_output?: unknown
}

export function parseClaudeJsonEnvelope(stdout: string): ExplainResult {
  const trimmed = stdout.trim()
  if (!trimmed) throw new Error('claude -p returned empty output')

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('claude -p output was not valid JSON')
  }

  // claude -p --output-format json emits an array of streamed events; the final
  // event has type "result" and carries structured_output when --json-schema is set.
  const events: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
  const resultEvent = events.find(
    (e): e is ClaudeResultEvent => !!e && typeof e === 'object' && (e as { type?: unknown }).type === 'result'
  )
  if (!resultEvent) throw new Error('claude -p produced no result event')
  if (resultEvent.is_error) {
    const msg = typeof resultEvent.result === 'string' ? resultEvent.result : 'claude -p reported an error'
    throw new Error(msg)
  }

  const candidates: unknown[] = [resultEvent.structured_output, resultEvent.result]
  for (const cand of candidates) {
    if (cand && typeof cand === 'object') {
      return cand as ExplainResult
    }
    if (typeof cand === 'string' && cand.trim()) {
      try {
        return JSON.parse(cand) as ExplainResult
      } catch {
        // try the next candidate
      }
    }
  }
  throw new Error('claude -p result event had no structured output')
}

function runClaude(projectRoot: string, diffText: string, level: ExplainLevel): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(SCHEMA),
      '--append-system-prompt', promptForLevel(level),
      '--add-dir', projectRoot,
      '--input-format', 'text',
      'Here is the diff to explain. Return JSON matching the schema exactly:\n\n' + diffText
    ]

    const home = process.env.HOME ?? ''
    const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', `${home}/.local/bin`].filter(Boolean).join(':')
    const envPath = `${extraPath}:${process.env.PATH ?? ''}`

    const proc = spawn('claude', args, {
      cwd: projectRoot,
      env: { ...process.env, PATH: envPath }
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8') })

    proc.on('error', (err) => {
      const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'claude CLI not found on PATH. Install it from https://docs.anthropic.com/claude/code'
        : `Failed to start claude: ${err.message}`
      reject(new Error(msg))
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}: ${stderr.trim() || stdout.trim().slice(0, 200)}`))
        return
      }
      resolve(stdout)
    })
  })
}

export async function explainDiff({ projectRoot, diffText, source, level }: ExplainArgs): Promise<ExplainResult> {
  const resolvedLevel: ExplainLevel = level ?? 'deep'
  const diff = (diffText && diffText.trim())
    ? diffText
    : await runGit(projectRoot, diffArgs(source ?? { kind: 'working' }))

  if (!diff.trim()) {
    return {
      generatedAt: new Date().toISOString(),
      diffSha: shaOf(''),
      level: resolvedLevel,
      files: []
    }
  }

  const stdout = await runClaude(projectRoot, diff, resolvedLevel)
  const parsed = parseClaudeJsonEnvelope(stdout)

  return {
    generatedAt: new Date().toISOString(),
    diffSha: shaOf(diff),
    level: resolvedLevel,
    files: Array.isArray(parsed.files) ? parsed.files : []
  }
}

export function registerClaudeExplainHandlers(): void {
  safeHandle('claude:explain-diff', async (_event, args: ExplainArgs): Promise<ExplainResult> => {
    return explainDiff(args)
  })
}
