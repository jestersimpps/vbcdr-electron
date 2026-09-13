import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import type { GhStatus, PrInfo, PrState } from '@main/models/types'
import { gitEnv } from '@main/services/git-env'

const execFile = promisify(execFileCb)

interface ExecError {
  code?: string | number
  stderr?: string
  message?: string
}

async function runGh(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('gh', args, { cwd, encoding: 'utf-8', timeout: 20000, env: gitEnv() })
  return stdout.trim()
}

function isMissingBinary(err: ExecError): boolean {
  return err.code === 'ENOENT'
}

function errorText(err: ExecError): string {
  return (err.stderr ?? err.message ?? '').trim()
}

export async function getGhStatus(): Promise<GhStatus> {
  try {
    await runGh(process.cwd(), ['auth', 'status'])
    return { available: true, authenticated: true, message: null }
  } catch (err) {
    const e = err as ExecError
    if (isMissingBinary(e)) {
      return { available: false, authenticated: false, message: 'GitHub CLI (gh) is not installed' }
    }
    return { available: true, authenticated: false, message: errorText(e) || 'gh is not authenticated' }
  }
}

function toPrState(raw: string): PrState {
  switch (raw.toUpperCase()) {
    case 'OPEN':
      return 'open'
    case 'MERGED':
      return 'merged'
    case 'CLOSED':
      return 'closed'
    default:
      return 'unknown'
  }
}

export async function getPrForBranch(cwd: string): Promise<PrInfo> {
  try {
    const raw = await runGh(cwd, ['pr', 'view', '--json', 'url,state'])
    const parsed = JSON.parse(raw) as { url?: string; state?: string }
    return { url: parsed.url ?? null, state: toPrState(parsed.state ?? '') }
  } catch (err) {
    const e = err as ExecError
    if (isMissingBinary(e)) return { url: null, state: 'unknown' }
    if (/no pull requests found/i.test(errorText(e))) return { url: null, state: 'none' }
    return { url: null, state: 'unknown' }
  }
}
