import { watch, type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import ignore, { type Ignore } from 'ignore'
import type { FileNode } from '@main/models/types'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'webm', 'aiff', 'aif'])
const OFFICE_EXTS = new Set(['pdf', 'docx', 'xlsx', 'xls'])
const BASE64_EXTS = new Set([...OFFICE_EXTS, ...AUDIO_EXTS])
const BINARY_EXTS = new Set([
  ...IMAGE_EXTS, 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  ...OFFICE_EXTS, 'pptx',
  ...AUDIO_EXTS,
  'zip', 'tar', 'gz',
  'mp4', 'mov', 'avi'
])

export interface FileReadResult {
  content: string
  isBinary: boolean
}

function getExt(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase()
}

let watcher: FSWatcher | null = null
let currentRoot: string | null = null
let currentShowIgnored = false
const fileDebounce = new Map<string, NodeJS.Timeout>()
let treeDebounce: NodeJS.Timeout | null = null

const ALWAYS_IGNORE = ['.git', 'node_modules', '.DS_Store']

function loadGitignorePatterns(rootPath: string): Ignore {
  const ig = ignore()
  const gitignorePath = path.join(rootPath, '.gitignore')
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    ig.add(content)
  } catch {
    // no .gitignore
  }
  return ig
}

export async function readTree(rootPath: string, showIgnored: boolean = false, maxDepth: number = 10): Promise<FileNode> {
  const alwaysIg = ignore().add(ALWAYS_IGNORE)
  const gitIg = loadGitignorePatterns(rootPath)

  async function walk(dirPath: string, depth: number): Promise<FileNode[]> {
    if (depth > maxDepth) return []

    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true })
    } catch {
      return []
    }

    const childPromises: Array<Promise<FileNode | null>> = []
    for (const entry of entries) {
      const rel = path.relative(rootPath, path.join(dirPath, entry.name))
      if (alwaysIg.ignores(rel)) continue

      const isIgnored = gitIg.ignores(rel)
      if (isIgnored && !showIgnored) continue

      const fullPath = path.join(dirPath, entry.name)
      const isDir = entry.isDirectory()

      if (isDir) {
        childPromises.push(
          walk(fullPath, depth + 1).then((children) => ({
            name: entry.name,
            path: fullPath,
            isDirectory: true,
            isGitignored: isIgnored || undefined,
            children
          }))
        )
      } else {
        childPromises.push(
          Promise.resolve({
            name: entry.name,
            path: fullPath,
            isDirectory: false,
            isGitignored: isIgnored || undefined
          })
        )
      }
    }

    const nodes = (await Promise.all(childPromises)).filter((n): n is FileNode => n !== null)
    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return {
    name: path.basename(rootPath),
    path: rootPath,
    isDirectory: true,
    children: await walk(rootPath, 0)
  }
}

export function startWatching(rootPath: string, win: BrowserWindow, showIgnored: boolean = false): void {
  stopWatching()
  currentRoot = rootPath
  currentShowIgnored = showIgnored

  const alwaysIg = ignore().add(ALWAYS_IGNORE)
  const gitIg = loadGitignorePatterns(rootPath)

  watcher = watch(rootPath, {
    ignoreInitial: true,
    ignored: (filePath: string) => {
      const rel = path.relative(rootPath, filePath)
      if (!rel || rel === '.') return false
      if (alwaysIg.ignores(rel)) return true
      if (!showIgnored && gitIg.ignores(rel)) return true
      return false
    },
    depth: 10,
    persistent: true
  })

  watcher.on('all', (event: string, filePath: string) => {
    if (win.isDestroyed() || !currentRoot) return

    if (treeDebounce) clearTimeout(treeDebounce)
    treeDebounce = setTimeout(() => {
      treeDebounce = null
      if (win.isDestroyed() || !currentRoot) return
      const root = currentRoot
      const showIgnoredAtFire = currentShowIgnored
      readTree(root, showIgnoredAtFire).then((tree) => {
        if (win.isDestroyed() || currentRoot !== root) return
        win.webContents.send('fs:tree-changed', tree)
      }).catch(() => {})
    }, 200)

    if (event === 'change') {
      if (BINARY_EXTS.has(getExt(filePath))) return
      const existing = fileDebounce.get(filePath)
      if (existing) clearTimeout(existing)
      fileDebounce.set(
        filePath,
        setTimeout(() => {
          fileDebounce.delete(filePath)
          if (win.isDestroyed()) return
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            win.webContents.send('fs:file-changed', filePath, content)
          } catch {
            // file may be temporarily locked during write
          }
        }, 150)
      )
    }
  })
}

export function readFileContents(filePath: string): FileReadResult {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return { content: '', isBinary: false }
  }
  if (stat.isDirectory()) return { content: '', isBinary: false }

  const ext = getExt(filePath)
  if (IMAGE_EXTS.has(ext)) {
    return { content: fs.readFileSync(filePath).toString('base64'), isBinary: true }
  }
  if (ext === 'svg') {
    return { content: fs.readFileSync(filePath, 'utf-8'), isBinary: true }
  }
  if (BASE64_EXTS.has(ext)) {
    return { content: fs.readFileSync(filePath).toString('base64'), isBinary: true }
  }
  if (BINARY_EXTS.has(ext)) {
    return { content: '', isBinary: true }
  }
  return { content: fs.readFileSync(filePath, 'utf-8'), isBinary: false }
}

export function stopWatching(): void {
  if (treeDebounce) { clearTimeout(treeDebounce); treeDebounce = null }
  for (const timer of fileDebounce.values()) clearTimeout(timer)
  fileDebounce.clear()
  if (watcher) {
    watcher.close()
    watcher = null
    currentRoot = null
  }
}
