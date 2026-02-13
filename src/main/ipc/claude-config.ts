import fs from 'fs'
import path from 'path'
import os from 'os'
import { ipcMain } from 'electron'
import type { ClaudeFileEntry, ClaudeSection } from '@main/models/types'

const SKIP_DIRS = new Set(['cache', 'debug', 'telemetry', 'todos', 'sessions'])
const SKIP_EXTS = new Set(['.jsonl'])

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function addFiles(dir: string, section: ClaudeSection, entries: ClaudeFileEntry[]): void {
  for (const name of safeReaddir(dir)) {
    const fullPath = path.join(dir, name)
    const ext = path.extname(name)
    if (SKIP_EXTS.has(ext)) continue
    try {
      if (fs.statSync(fullPath).isFile()) {
        entries.push({ name, path: fullPath, section })
      }
    } catch {
      // skip inaccessible
    }
  }
}

function scanClaudeFiles(projectPath: string): ClaudeFileEntry[] {
  const claudeDir = path.join(os.homedir(), '.claude')
  const entries: ClaudeFileEntry[] = []

  const claudeMd = path.join(claudeDir, 'CLAUDE.md')
  if (fs.existsSync(claudeMd)) {
    entries.push({ name: 'CLAUDE.md', path: claudeMd, section: 'global' })
  }

  const settingsJson = path.join(claudeDir, 'settings.json')
  if (fs.existsSync(settingsJson)) {
    entries.push({ name: 'settings.json', path: settingsJson, section: 'global' })
  }

  addFiles(path.join(claudeDir, 'rules'), 'global', entries)

  const skillsDir = path.join(claudeDir, 'skills')
  for (const skillName of safeReaddir(skillsDir)) {
    const skillDir = path.join(skillsDir, skillName)
    try {
      if (!fs.statSync(skillDir).isDirectory()) continue
    } catch {
      continue
    }
    if (SKIP_DIRS.has(skillName)) continue

    const skillMd = path.join(skillDir, 'SKILL.md')
    if (fs.existsSync(skillMd)) {
      entries.push({ name: `${skillName}/SKILL.md`, path: skillMd, section: 'skills' })
    }

    const refsDir = path.join(skillDir, 'references')
    for (const refName of safeReaddir(refsDir)) {
      const refPath = path.join(refsDir, refName)
      try {
        if (fs.statSync(refPath).isFile()) {
          entries.push({ name: `${skillName}/references/${refName}`, path: refPath, section: 'skills' })
        }
      } catch {
        // skip
      }
    }
  }

  addFiles(path.join(claudeDir, 'commands'), 'commands', entries)

  addFiles(path.join(claudeDir, 'scripts'), 'hooks', entries)

  const keybindingsJson = path.join(claudeDir, 'keybindings.json')
  if (fs.existsSync(keybindingsJson)) {
    entries.push({ name: 'keybindings.json', path: keybindingsJson, section: 'global' })
  }

  const projectKey = projectPath.replace(/\//g, '-')
  const projectConfigDir = path.join(claudeDir, 'projects', projectKey)

  const projectSettingsJson = path.join(projectConfigDir, 'settings.json')
  if (fs.existsSync(projectSettingsJson)) {
    entries.push({ name: 'settings.json (project)', path: projectSettingsJson, section: 'project' })
  }

  const projectClaudeMdGlobal = path.join(projectConfigDir, 'CLAUDE.md')
  if (fs.existsSync(projectClaudeMdGlobal)) {
    entries.push({ name: 'CLAUDE.md (project config)', path: projectClaudeMdGlobal, section: 'project' })
  }

  const projectMemDir = path.join(projectConfigDir, 'memory')
  addFiles(projectMemDir, 'project', entries)

  const projectClaudeDir = path.join(projectPath, '.claude')
  for (const name of safeReaddir(projectClaudeDir)) {
    if (SKIP_DIRS.has(name)) continue
    const fullPath = path.join(projectClaudeDir, name)
    const ext = path.extname(name)
    if (SKIP_EXTS.has(ext)) continue
    try {
      if (fs.statSync(fullPath).isFile()) {
        entries.push({ name: `.claude/${name}`, path: fullPath, section: 'project' })
      }
    } catch {
      // skip
    }
  }

  const projectClaudeMd = path.join(projectPath, 'CLAUDE.md')
  if (fs.existsSync(projectClaudeMd)) {
    entries.push({ name: 'CLAUDE.md (project root)', path: projectClaudeMd, section: 'project' })
  }

  return entries
}

function isAllowedClaudePath(filePath: string, projectPath?: string): boolean {
  const resolved = path.resolve(filePath)
  const claudeDir = path.join(os.homedir(), '.claude')
  if (resolved.startsWith(claudeDir + path.sep)) return true
  if (projectPath) {
    const projectClaudeDir = path.join(path.resolve(projectPath), '.claude')
    if (resolved.startsWith(projectClaudeDir + path.sep)) return true
    if (resolved === path.join(path.resolve(projectPath), 'CLAUDE.md')) return true
  }
  return false
}

export function registerClaudeConfigHandlers(): void {
  ipcMain.handle('claude:scan-files', (_event, projectPath: string): ClaudeFileEntry[] => {
    return scanClaudeFiles(projectPath)
  })

  ipcMain.handle('claude:read-file', (_event, filePath: string, projectPath: string): string => {
    const resolved = path.resolve(filePath)
    if (!isAllowedClaudePath(resolved, projectPath)) throw new Error('Path not allowed')
    return fs.readFileSync(resolved, 'utf-8')
  })

  ipcMain.handle('claude:write-file', (_event, filePath: string, content: string, projectPath: string): void => {
    const resolved = path.resolve(filePath)
    if (!isAllowedClaudePath(resolved, projectPath)) throw new Error('Path not allowed')
    fs.writeFileSync(resolved, content, 'utf-8')
  })

  ipcMain.handle('claude:delete-file', (_event, filePath: string, projectPath: string): void => {
    const resolved = path.resolve(filePath)
    if (!isAllowedClaudePath(resolved, projectPath)) throw new Error('Path not allowed')
    fs.unlinkSync(resolved)
  })
}
