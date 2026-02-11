import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'

interface PtyInstance {
  process: pty.IPty
  projectId: string
}

const instances = new Map<string, PtyInstance>()

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

function shellEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  env.TERM = 'xterm-256color'
  env.TERM_PROGRAM = 'vibecoder'
  if (!env.PATH || !env.PATH.includes('/usr/local/bin')) {
    try {
      const loginPath = execSync('/bin/bash -ilc "echo $PATH"', { encoding: 'utf-8' }).trim()
      if (loginPath) env.PATH = loginPath
    } catch {
      // keep existing PATH
    }
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
  const proc = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: shellEnv()
  })

  proc.onData((data: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', tabId, data)
    }
  })

  proc.onExit(({ exitCode }) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', tabId, exitCode)
    }
    instances.delete(tabId)
  })

  instances.set(tabId, { process: proc, projectId })
}

export function writePty(tabId: string, data: string): void {
  instances.get(tabId)?.process.write(data)
}

export function resizePty(tabId: string, cols: number, rows: number): void {
  instances.get(tabId)?.process.resize(cols, rows)
}

export function killPty(tabId: string): void {
  const instance = instances.get(tabId)
  if (instance) {
    instance.process.kill()
    instances.delete(tabId)
  }
}

export function killAll(): void {
  for (const [, instance] of instances) {
    instance.process.kill()
  }
  instances.clear()
}
