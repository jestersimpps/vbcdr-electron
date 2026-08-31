import { BrowserWindow } from 'electron'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import ignore from 'ignore'
import { GitignoreMatcher, createLimiter, toPosix } from '@main/services/fs-scan-utils'
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

let watcher: fs.FSWatcher | null = null
let currentRoot: string | null = null
let currentShowIgnored = false
let currentMatcher: GitignoreMatcher | null = null
const fileDebounce = new Map<string, NodeJS.Timeout>()
let treeDebounce: NodeJS.Timeout | null = null

const ALWAYS_IGNORE = ['.git', 'node_modules', '.DS_Store']
const MAX_TREE_NODES = 30000
const READDIR_CONCURRENCY = 16

export async function readTree(
  rootPath: string,
  showIgnored: boolean = false,
  maxDepth: number = 10,
  maxNodes: number = MAX_TREE_NODES
): Promise<FileNode> {
  const alwaysIg = ignore().add(ALWAYS_IGNORE)
  const matcher = currentMatcher && currentRoot === rootPath
    ? currentMatcher
    : new GitignoreMatcher(rootPath)
  const limit = createLimiter(READDIR_CONCURRENCY)
  const budget = { nodes: 0, truncated: false }

  async function walk(dirPath: string, depth: number): Promise<FileNode[]> {
    if (depth > maxDepth) return []
    if (budget.nodes >= maxNodes) {
      budget.truncated = true
      return []
    }

    let entries: fs.Dirent[]
    try {
      entries = await limit(() => fsp.readdir(dirPath, { withFileTypes: true }))
    } catch {
      return []
    }

    const dirPromises: Array<Promise<FileNode>> = []
    const fileNodes: FileNode[] = []
    for (const entry of entries) {
      if (budget.nodes >= maxNodes) {
        budget.truncated = true
        break
      }
      const fullPath = path.join(dirPath, entry.name)
      const rel = toPosix(path.relative(rootPath, fullPath))
      if (alwaysIg.ignores(rel)) continue

      const isDir = entry.isDirectory()
      const isIgnored = matcher.ignores(fullPath, isDir)
      if (isIgnored && !showIgnored) continue

      budget.nodes++
      if (isDir) {
        dirPromises.push(
          walk(fullPath, depth + 1).then((children) => ({
            name: entry.name,
            path: fullPath,
            isDirectory: true,
            isGitignored: isIgnored || undefined,
            children
          }))
        )
      } else {
        fileNodes.push({
          name: entry.name,
          path: fullPath,
          isDirectory: false,
          isGitignored: isIgnored || undefined
        })
      }
    }

    const nodes = [...(await Promise.all(dirPromises)), ...fileNodes]
    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  const children = await walk(rootPath, 0)
  return {
    name: path.basename(rootPath),
    path: rootPath,
    isDirectory: true,
    children,
    truncated: budget.truncated || undefined
  }
}

/**
 * Decides whether a path is outside the watched set. Kept as a standalone,
 * side-effect-free function because it is the whole ignore contract (always-ignore
 * list + root and nested .gitignore files) and is worth testing directly.
 */
export function isIgnoredPath(
  rootPath: string,
  matcher: GitignoreMatcher,
  filePath: string,
  isDirectory: boolean
): boolean {
  const rel = path.relative(rootPath, filePath)
  if (!rel || rel === '.') return false
  if (rel.startsWith('..') || path.isAbsolute(rel)) return true
  // A recursive watcher hands us deep paths inside .git/node_modules constantly,
  // and those are by far the highest-volume events in a real repo, so check every
  // segment rather than only the entry name.
  for (const segment of toPosix(rel).split('/')) {
    if (ALWAYS_IGNORE.includes(segment)) return true
  }
  if (matcher.ignores(filePath, isDirectory)) return true
  return false
}

/**
 * ONE recursive fs.watch for the whole project, not one watcher per directory.
 *
 * chokidar opens a descriptor per directory. On a large monorepo that is
 * thousands of them (measured: 5,606 directories in a real repo, against a
 * soft limit of 256), which floods the main process with EMFILE rejections
 * and starves the event loop - a 12s wait measured at 84s. A single recursive
 * watch is backed by FSEvents on macOS and costs one descriptor for the tree.
 *
 * The trade-off is coarser events: fs.watch reports only 'rename' (created,
 * deleted or moved) and 'change' (contents), with no directory/file
 * distinction, so 'rename' always schedules a debounced tree rescan.
 */
export function startWatching(rootPath: string, win: BrowserWindow, showIgnored: boolean = false): void {
  stopWatching()
  currentRoot = rootPath
  currentShowIgnored = showIgnored
  currentMatcher = new GitignoreMatcher(rootPath)
  const matcher = currentMatcher

  const scheduleTreeRescan = (): void => {
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
    }, 500)
  }

  const handleChangedFile = (filePath: string): void => {
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
          // file may be temporarily locked, or already gone, during a write
        }
      }, 150)
    )
  }

  const onEvent = (eventType: string, filePath: string): void => {
    if (win.isDestroyed() || !currentRoot) return

    const isGitignoreFile = path.basename(filePath) === '.gitignore'
    if (isGitignoreFile) matcher.invalidateDir(path.dirname(filePath))

    // The path may already be gone, so never stat to decide what it was:
    // filter only when it is ignored whether treated as a file or a directory.
    if (isIgnoredPath(rootPath, matcher, filePath, false) &&
        isIgnoredPath(rootPath, matcher, filePath, true)) {
      return
    }

    if (eventType === 'rename') {
      scheduleTreeRescan()
      return
    }
    if (eventType === 'change') {
      if (isGitignoreFile) scheduleTreeRescan()
      handleChangedFile(filePath)
    }
  }

  try {
    const w = fs.watch(rootPath, { recursive: true, persistent: true })
    // Without this, an EMFILE/ENOSPC from the watcher becomes an unhandled
    // rejection on the main process - 916 of them in one observed session.
    w.on('error', () => { stopWatching() })
    w.on('change', (eventType, filename) => {
      if (!filename) {
        scheduleTreeRescan()
        return
      }
      const rel = typeof filename === 'string' ? filename : filename.toString('utf-8')
      onEvent(String(eventType), path.resolve(rootPath, rel))
    })
    watcher = w
  } catch {
    // Recursive watching unsupported on this platform/filesystem: degrade to no
    // live updates rather than opening a descriptor per directory. The tree can
    // still be refreshed manually.
    watcher = null
  }
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
  const buf = fs.readFileSync(filePath)
  if (buf.subarray(0, 8192).includes(0)) {
    return { content: '', isBinary: true }
  }
  return { content: buf.toString('utf-8'), isBinary: false }
}

export function stopWatching(): void {
  if (treeDebounce) { clearTimeout(treeDebounce); treeDebounce = null }
  for (const timer of fileDebounce.values()) clearTimeout(timer)
  fileDebounce.clear()
  if (watcher) {
    watcher.close()
    watcher = null
    currentRoot = null
    currentMatcher = null
  }
}
