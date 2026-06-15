import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'
import {
  loadScrollback,
  appendScrollback,
  clearScrollback,
  flushScrollback
} from '@main/services/terminal-scrollback'
import { resetTabTokenTracking } from '@main/services/token-usage-service'

export { flushScrollback }

interface PtyInstance {
  process: pty.IPty
  projectId: string
  pendingChunks: string[]
  pendingBytes: number
  flushTimer: ReturnType<typeof setTimeout> | null
}

const instances = new Map<string, PtyInstance>()
const IPC_BATCH_MS = 16
const PENDING_BYTES_CAP = 4 * 1024 * 1024

function flushPending(tabId: string, win: BrowserWindow): void {
  const instance = instances.get(tabId)
  if (!instance) return
  instance.flushTimer = null
  if (instance.pendingChunks.length === 0) return
  const batch = instance.pendingChunks.join('')
  instance.pendingChunks.length = 0
  instance.pendingBytes = 0
  if (!win.isDestroyed()) {
    win.webContents.send('terminal:data', tabId, batch)
  }
}

export function hasPty(tabId: string): boolean {
  return instances.has(tabId)
}

function defaultShell(): string {
  if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
    return process.env.SHELL
  }
  if (os.platform() === 'darwin') {
    try {
      const shell = execSync('dscl . -read /Users/$USER UserShell', { encoding: 'utf-8' })
      const match = shell.match(/UserShell:\s*(.+)/)
      if (match?.[1] && fs.existsSync(match[1])) return match[1]
    } catch {
      // fall through
    }
    if (fs.existsSync('/bin/zsh')) return '/bin/zsh'
    return '/bin/bash'
  }
  if (os.platform() === 'win32') return 'powershell.exe'
  return '/bin/sh'
}

let loginPathProbed = false
let cachedLoginPath: string | null = null

function probeLoginPath(): string | null {
  if (loginPathProbed) return cachedLoginPath
  loginPathProbed = true
  if (os.platform() === 'win32') return null
  try {
    const loginPath = execSync('/bin/bash -ilc "echo $PATH"', {
      encoding: 'utf-8',
      timeout: 5000
    }).trim()
    cachedLoginPath = loginPath || null
  } catch {
    cachedLoginPath = null
  }
  return cachedLoginPath
}

function shellEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  env.TERM = 'xterm-256color'
  env.TERM_PROGRAM = 'vbcdr'
  if (os.platform() === 'darwin') {
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'credential.helper'
    env.GIT_CONFIG_VALUE_0 = 'osxkeychain'
  }
  if (!env.PATH || !env.PATH.includes('/usr/local/bin')) {
    const loginPath = probeLoginPath()
    if (loginPath) env.PATH = loginPath
  }
  return env
}

export function createPty(
  tabId: string,
  projectId: string,
  cwd: string,
  win: BrowserWindow,
  cols: number = 80,
  rows: number = 24
): void {
  const shell = defaultShell()
  const safeCwd = fs.existsSync(cwd) ? cwd : os.homedir()
  const env = shellEnv()

  const saved = loadScrollback(tabId)
  if (saved.length > 0 && !win.isDestroyed()) {
    win.webContents.send(
      'terminal:data',
      tabId,
      saved + '\r\n\x1b[2m── session restored ──\x1b[0m\r\n'
    )
  }

  let proc: pty.IPty
  try {
    proc = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: safeCwd,
      env
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!win.isDestroyed()) {
      win.webContents.send(
        'terminal:data',
        tabId,
        `\r\n\x1b[31mFailed to start terminal: ${message}\x1b[0m\r\n`
      )
      win.webContents.send('terminal:exit', tabId, 1)
    }
    return
  }

  instances.set(tabId, {
    process: proc,
    projectId,
    pendingChunks: [],
    pendingBytes: 0,
    flushTimer: null
  })

  proc.onData((data: string) => {
    appendScrollback(tabId, data)
    const instance = instances.get(tabId)
    if (!instance) return
    instance.pendingChunks.push(data)
    instance.pendingBytes += data.length
    if (instance.pendingBytes > PENDING_BYTES_CAP) {
      const joined = instance.pendingChunks.join('').slice(-PENDING_BYTES_CAP)
      instance.pendingChunks.length = 0
      instance.pendingChunks.push(joined)
      instance.pendingBytes = joined.length
    }
    if (!instance.flushTimer) {
      instance.flushTimer = setTimeout(() => flushPending(tabId, win), IPC_BATCH_MS)
    }
  })

  proc.onExit(({ exitCode }) => {
    const instance = instances.get(tabId)
    if (instance?.flushTimer) {
      clearTimeout(instance.flushTimer)
      flushPending(tabId, win)
    }
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', tabId, exitCode)
    }
    instances.delete(tabId)
    resetTabTokenTracking(tabId)
  })
}

export function writePty(tabId: string, data: string): boolean {
  const instance = instances.get(tabId)
  if (!instance) return false
  instance.process.write(data)
  return true
}

export function resizePty(tabId: string, cols: number, rows: number): void {
  instances.get(tabId)?.process.resize(cols, rows)
}

export function killPty(tabId: string): void {
  const instance = instances.get(tabId)
  if (instance) {
    if (instance.flushTimer) clearTimeout(instance.flushTimer)
    instance.process.kill()
    instances.delete(tabId)
  }
  clearScrollback(tabId)
  resetTabTokenTracking(tabId)
}

export function killAll(): void {
  flushScrollback()
  for (const [, instance] of instances) {
    if (instance.flushTimer) clearTimeout(instance.flushTimer)
    instance.process.kill()
  }
  instances.clear()
}

export function killOrphanedPtys(): void {
  try {
    const output = execSync('ps eww -ax -o pid,ppid,command', { encoding: 'utf-8' })
    for (const line of output.split('\n')) {
      if (!line.includes('TERM_PROGRAM=vbcdr')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parseInt(parts[0], 10)
      const ppid = parseInt(parts[1], 10)
      if (ppid === 1 && !isNaN(pid)) {
        try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
      }
    }
  } catch { /* grep returns non-zero when no matches */ }
}
