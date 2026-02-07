import { watch, type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import ignore, { type Ignore } from 'ignore'
import type { FileNode } from '@main/models/types'

let watcher: FSWatcher | null = null
let currentRoot: string | null = null

function loadGitignore(rootPath: string): Ignore {
  const ig = ignore()
  ig.add(['.git', 'node_modules', '.DS_Store'])
  const gitignorePath = path.join(rootPath, '.gitignore')
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    ig.add(content)
  } catch {
    // no .gitignore
  }
  return ig
}

export function readTree(rootPath: string, maxDepth: number = 3): FileNode {
  const ig = loadGitignore(rootPath)

  function walk(dirPath: string, depth: number): FileNode[] {
    if (depth > maxDepth) return []

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return []
    }

    const nodes: FileNode[] = []
    for (const entry of entries) {
      const rel = path.relative(rootPath, path.join(dirPath, entry.name))
      if (ig.ignores(rel)) continue

      const fullPath = path.join(dirPath, entry.name)
      const isDir = entry.isDirectory()

      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: isDir,
        children: isDir ? walk(fullPath, depth + 1) : undefined
      })
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return {
    name: path.basename(rootPath),
    path: rootPath,
    isDirectory: true,
    children: walk(rootPath, 0)
  }
}

export function startWatching(rootPath: string, win: BrowserWindow): void {
  stopWatching()
  currentRoot = rootPath

  const ig = loadGitignore(rootPath)

  watcher = watch(rootPath, {
    ignoreInitial: true,
    ignored: (filePath: string) => {
      const rel = path.relative(rootPath, filePath)
      if (!rel || rel === '.') return false
      return ig.ignores(rel)
    },
    depth: 10,
    persistent: true
  })

  watcher.on('all', () => {
    if (!win.isDestroyed() && currentRoot) {
      const tree = readTree(currentRoot)
      win.webContents.send('fs:tree-changed', tree)
    }
  })
}

export function readFileContents(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
    currentRoot = null
  }
}
