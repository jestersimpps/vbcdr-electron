import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const BIN_CANDIDATES = ['/opt/homebrew/bin/edge-tts', '/usr/local/bin/edge-tts', 'edge-tts']
const MAX_TEXT = 200
const TIMEOUT_MS = 10_000

export const DEFAULT_COMPANION_VOICE = 'en-US-AvaNeural'

let resolvedBin: string | null | undefined

function findBin(): string | null {
  if (resolvedBin !== undefined) return resolvedBin
  resolvedBin = BIN_CANDIDATES.find((p) => p === 'edge-tts' || fs.existsSync(p)) ?? null
  return resolvedBin
}

function tmpTarget(): string {
  return path.join(os.tmpdir(), `vbcdr-tts-${crypto.randomBytes(6).toString('hex')}.mp3`)
}

export async function synthesize(text: string, voice: string): Promise<Uint8Array | null> {
  const clean = text.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX_TEXT)
  if (!clean) return null

  const bin = findBin()
  if (!bin) return null

  const target = tmpTarget()
  const args = ['--text', clean, '--voice', voice, '--write-media', target]

  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn(bin, args, { stdio: 'ignore' })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve(false)
    }, TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })

  if (!ok) {
    try {
      fs.unlinkSync(target)
    } catch {
      /* nothing to clean */
    }
    return null
  }

  try {
    const bytes = fs.readFileSync(target)
    return new Uint8Array(bytes)
  } catch {
    return null
  } finally {
    try {
      fs.unlinkSync(target)
    } catch {
      /* already gone */
    }
  }
}
