import { BrowserWindow } from 'electron'
import { fetchRemote, getBranchDrift, isGitRepo } from '@main/services/git-service'
import type { BranchDriftInfo } from '@main/models/types'

const projects = new Map<string, string>()
let intervalId: ReturnType<typeof setInterval> | null = null

function broadcast(projectId: string, drift: BranchDriftInfo): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('git:drift', projectId, drift)
  }
}

function tick(): void {
  for (const [projectId, cwd] of projects) {
    try {
      if (!isGitRepo(cwd)) continue
      fetchRemote(cwd)
      const drift = getBranchDrift(cwd)
      if (drift.behind > 0 || drift.diverged) {
        broadcast(projectId, drift)
      }
    } catch {
      // silent
    }
  }
}

export function registerProject(projectId: string, cwd: string): void {
  projects.set(projectId, cwd)
  if (!intervalId) {
    intervalId = setInterval(tick, 60_000)
  }
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

export function fetchNow(cwd: string): BranchDriftInfo {
  fetchRemote(cwd)
  return getBranchDrift(cwd)
}
