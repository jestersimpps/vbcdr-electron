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

  const projectKey = projectPath.replace(/\//g, '-')
  const projectMemDir = path.join(claudeDir, 'projects', projectKey, 'memory')
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

export function registerClaudeConfigHandlers(): void {
  ipcMain.handle('claude:scan-files', (_event, projectPath: string): ClaudeFileEntry[] => {
    return scanClaudeFiles(projectPath)
  })
}
