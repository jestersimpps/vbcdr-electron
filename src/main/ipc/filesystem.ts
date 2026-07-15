import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { BrowserWindow, clipboard, dialog, shell } from 'electron'
import Store from 'electron-store'
import { readTree, readFileContents, startWatching, stopWatching } from '@main/services/file-watcher'
import type { FileReadResult } from '@main/services/file-watcher'
import { GitignoreMatcher, createLimiter } from '@main/services/fs-scan-utils'
import type { FileNode, Project, SearchResult } from '@main/models/types'
import { safeHandle } from '@main/ipc/safe-handle'

const store = new Store<{ projects: Project[] }>({ defaults: { projects: [] } })

const ALWAYS_IGNORE = new Set(['.git', 'node_modules', '.DS_Store'])
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'docx', 'xlsx', 'xls', 'pptx',
  'zip', 'tar', 'gz',
  'mp3', 'mp4', 'mov', 'avi', 'wav'
])

function isWithinProjectRoot(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  const projects = store.get('projects')
  return projects.some((p) => resolved.startsWith(p.path + path.sep) || resolved === p.path)
}

function normalizeExclude(entry: string): string {
  return entry.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/').trim()
}

function isExcluded(relDir: string, excludes: string[]): boolean {
  if (excludes.length === 0) return false
  const norm = relDir.replace(/\\/g, '/')
  for (const ex of excludes) {
    if (!ex) continue
    if (norm === ex) return true
    if (norm.startsWith(ex + '/')) return true
    if (!ex.includes('/') && norm.split('/').includes(ex)) return true
  }
  return false
}

const SEARCH_CONCURRENCY = 8
const SEARCH_MAX_FILE_BYTES = 1024 * 512

let searchGeneration = 0

async function searchFiles(
  rootPath: string,
  query: string,
  maxResults: number = 100,
  excludeFolders: string[] = []
): Promise<SearchResult[]> {
  const generation = ++searchGeneration
  const results: SearchResult[] = []
  const lowerQuery = query.toLowerCase()
  const excludes = excludeFolders.map(normalizeExclude).filter(Boolean)
  const matcher = new GitignoreMatcher(rootPath)
  const limit = createLimiter(SEARCH_CONCURRENCY)

  const stale = (): boolean => generation !== searchGeneration || results.length >= maxResults

  async function searchFileContents(fullPath: string, relativePath: string, name: string): Promise<void> {
    try {
      const stat = await limit(() => fsp.stat(fullPath))
      if (stat.size > SEARCH_MAX_FILE_BYTES || stale()) return
      const content = await limit(() => fsp.readFile(fullPath, 'utf-8'))
      if (stale()) return
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) return
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({
            path: fullPath,
            relativePath,
            name,
            type: 'content',
            line: i + 1,
            lineContent: lines[i].trim().substring(0, 200)
          })
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  async function walk(dirPath: string): Promise<void> {
    if (stale()) return
    let entries: fs.Dirent[]
    try {
      entries = await limit(() => fsp.readdir(dirPath, { withFileTypes: true }))
    } catch {
      return
    }
    const filePromises: Promise<void>[] = []
    for (const entry of entries) {
      if (stale()) break
      if (ALWAYS_IGNORE.has(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(rootPath, fullPath)
      const relPosix = relativePath.replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (isExcluded(relPosix, excludes)) continue
        if (matcher.ignores(fullPath, true)) continue
        await Promise.all(filePromises.splice(0))
        await walk(fullPath)
        continue
      }

      if (matcher.ignores(fullPath, false)) continue

      if (entry.name.toLowerCase().includes(lowerQuery)) {
        results.push({ path: fullPath, relativePath, name: entry.name, type: 'name' })
      }

      const ext = path.extname(entry.name).slice(1).toLowerCase()
      if (!BINARY_EXTS.has(ext)) {
        filePromises.push(searchFileContents(fullPath, relativePath, entry.name))
      }
    }
    await Promise.all(filePromises)
  }

  await walk(rootPath)
  return results.slice(0, maxResults)
}

export function registerFilesystemHandlers(): void {
  safeHandle('fs:read-tree', (_event, rootPath: string, showIgnored: boolean = false): Promise<FileNode> => {
    return readTree(rootPath, showIgnored)
  })

  safeHandle('fs:watch', (event, rootPath: string, showIgnored: boolean = false): void => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) startWatching(rootPath, win, showIgnored)
  })

  safeHandle('fs:read-file', (_event, filePath: string): FileReadResult => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    return readFileContents(resolved)
  })

  safeHandle('fs:read-image-data-url', async (_event, filePath: string): Promise<string | null> => {
    const resolved = path.resolve(filePath)
    const ext = path.extname(resolved).slice(1).toLowerCase()
    const mime: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif'
    }
    if (!mime[ext]) return null
    const stat = await fsp.stat(resolved)
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return null
    const buf = await fsp.readFile(resolved)
    return `data:${mime[ext]};base64,${buf.toString('base64')}`
  })

  safeHandle('fs:unwatch', (): void => {
    stopWatching()
  })

  safeHandle('fs:write-file', async (_event, filePath: string, content: string): Promise<void> => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    await fsp.writeFile(resolved, content, 'utf-8')
  })

  safeHandle('fs:delete-file', async (_event, filePath: string): Promise<void> => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    const stat = await fsp.stat(resolved)
    if (stat.isDirectory()) {
      await fsp.rm(resolved, { recursive: true })
    } else {
      await fsp.unlink(resolved)
    }
  })

  safeHandle('fs:create-file', async (_event, filePath: string): Promise<void> => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    await fsp.writeFile(resolved, '', 'utf-8')
  })

  safeHandle('fs:create-folder', async (_event, folderPath: string): Promise<void> => {
    const resolved = path.resolve(folderPath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    await fsp.mkdir(resolved, { recursive: true })
  })

  safeHandle('fs:rename', async (_event, oldPath: string, newPath: string): Promise<void> => {
    const resolvedOld = path.resolve(oldPath)
    const resolvedNew = path.resolve(newPath)
    if (!isWithinProjectRoot(resolvedOld)) throw new Error('Path outside project root')
    if (!isWithinProjectRoot(resolvedNew)) throw new Error('Path outside project root')
    await fsp.rename(resolvedOld, resolvedNew)
  })

  safeHandle('fs:duplicate', async (_event, filePath: string): Promise<string> => {
    const resolved = path.resolve(filePath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    const dir = path.dirname(resolved)
    const ext = path.extname(resolved)
    const base = path.basename(resolved, ext)
    let newPath = path.join(dir, `${base} (copy)${ext}`)
    let i = 2
    while (fs.existsSync(newPath)) {
      newPath = path.join(dir, `${base} (copy ${i})${ext}`)
      i++
    }
    await fsp.copyFile(resolved, newPath)
    return newPath
  })

  safeHandle('fs:search', (_event, rootPath: string, query: string, excludeFolders?: string[]): Promise<SearchResult[]> => {
    const resolved = path.resolve(rootPath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    return searchFiles(resolved, query, 100, Array.isArray(excludeFolders) ? excludeFolders : [])
  })

  safeHandle('fs:show-in-folder', (_event, filePath: string): void => {
    shell.showItemInFolder(path.resolve(filePath))
  })

  safeHandle('fs:open-folder', (_event, folderPath: string): Promise<string> => {
    return shell.openPath(path.resolve(folderPath))
  })

  safeHandle('fs:copy-path', (_event, filePath: string): void => {
    clipboard.writeText(filePath)
  })

  safeHandle('fs:pick-folder', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
