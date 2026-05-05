import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { BrowserWindow, clipboard, shell } from 'electron'
import Store from 'electron-store'
import { readTree, readFileContents, startWatching, stopWatching } from '@main/services/file-watcher'
import type { FileReadResult } from '@main/services/file-watcher'
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

function searchFiles(rootPath: string, query: string, maxResults: number = 100): SearchResult[] {
  const results: SearchResult[] = []
  const lowerQuery = query.toLowerCase()

  function walk(dirPath: string): void {
    if (results.length >= maxResults) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return
      if (ALWAYS_IGNORE.has(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(rootPath, fullPath)

      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      const nameMatch = entry.name.toLowerCase().includes(lowerQuery)
      const ext = path.extname(entry.name).slice(1).toLowerCase()
      const isBinary = BINARY_EXTS.has(ext)

      if (nameMatch) {
        results.push({ path: fullPath, relativePath, name: entry.name, type: 'name' })
      }

      if (!isBinary) {
        try {
          const stat = fs.statSync(fullPath)
          if (stat.size > 1024 * 512) continue
          const content = fs.readFileSync(fullPath, 'utf-8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) return
            if (lines[i].toLowerCase().includes(lowerQuery)) {
              results.push({
                path: fullPath,
                relativePath,
                name: entry.name,
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
    }
  }

  walk(rootPath)
  return results
}

export function registerFilesystemHandlers(): void {
  safeHandle('fs:read-tree', (_event, rootPath: string, showIgnored: boolean = false): FileNode => {
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

  safeHandle('fs:search', (_event, rootPath: string, query: string): SearchResult[] => {
    const resolved = path.resolve(rootPath)
    if (!isWithinProjectRoot(resolved)) throw new Error('Path outside project root')
    return searchFiles(resolved, query)
  })

  safeHandle('fs:show-in-folder', (_event, filePath: string): void => {
    shell.showItemInFolder(path.resolve(filePath))
  })

  safeHandle('fs:copy-path', (_event, filePath: string): void => {
    clipboard.writeText(filePath)
  })
}
