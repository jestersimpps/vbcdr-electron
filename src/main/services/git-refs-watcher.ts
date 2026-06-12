import { watch, type FSWatcher } from 'chokidar'
import path from 'path'
import { broadcastToAllWindows } from '@main/services/window-broadcast'

interface Entry {
  cwd: string
  watcher: FSWatcher
  debounce: ReturnType<typeof setTimeout> | null
}

const projects = new Map<string, Entry>()

function broadcast(projectId: string): void {
  broadcastToAllWindows('git:refs-changed', projectId)
}

export function watchRefs(projectId: string, cwd: string): void {
  const existing = projects.get(projectId)
  if (existing && existing.cwd === cwd) return
  if (existing) unwatchRefs(projectId)

  const gitDir = path.join(cwd, '.git')
  const targets = [
    path.join(gitDir, 'HEAD'),
    path.join(gitDir, 'refs'),
    path.join(gitDir, 'packed-refs')
  ]

  const watcher = watch(targets, {
    ignoreInitial: true,
    depth: 4,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })

  const entry: Entry = { cwd, watcher, debounce: null }
  projects.set(projectId, entry)

  watcher.on('all', () => {
    if (entry.debounce) clearTimeout(entry.debounce)
    entry.debounce = setTimeout(() => {
      entry.debounce = null
      broadcast(projectId)
    }, 250)
  })
}

export function unwatchRefs(projectId: string): void {
  const entry = projects.get(projectId)
  if (!entry) return
  if (entry.debounce) clearTimeout(entry.debounce)
  void entry.watcher.close()
  projects.delete(projectId)
}

export function stopAllRefsWatchers(): void {
  for (const projectId of [...projects.keys()]) unwatchRefs(projectId)
}
