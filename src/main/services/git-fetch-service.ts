import { BrowserWindow } from 'electron'
import { fetchRemote, getBranchDrift, isGitRepo } from '@main/services/git-service'
import type { BranchDriftInfo } from '@main/models/types'

const projects = new Map<string, string>()
let intervalId: ReturnType<typeof setInterval> | null = null
let ticking = false

function broadcast(projectId: string, drift: BranchDriftInfo): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('git:drift', projectId, drift)
    }
  }
}

async function checkProject(projectId: string, cwd: string): Promise<void> {
  try {
    if (!await isGitRepo(cwd)) return
    await fetchRemote(cwd)
    const drift = await getBranchDrift(cwd)
    if (drift.ahead > 0 || drift.behind > 0 || drift.diverged) {
      broadcast(projectId, drift)
    }
  } catch {
    // silent
  }
}

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    await Promise.all([...projects.entries()].map(([id, cwd]) => checkProject(id, cwd)))
  } finally {
    ticking = false
  }
}

export function registerProject(projectId: string, cwd: string): void {
  projects.set(projectId, cwd)
  if (!intervalId) {
    intervalId = setInterval(() => { void tick() }, 60_000)
  }
  void checkProject(projectId, cwd)
}

export function unregisterProject(projectId: string): void {
  projects.delete(projectId)
  if (projects.size === 0 && intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function stopAutoFetch(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  projects.clear()
}

export async function fetchNow(cwd: string): Promise<BranchDriftInfo> {
  await fetchRemote(cwd)
  return getBranchDrift(cwd)
}
