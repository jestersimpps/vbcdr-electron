import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, execSync } from 'child_process'
import { ipcMain, BrowserWindow } from 'electron'

let cachedLoginPath: string | undefined

function resolvedPath(): string | undefined {
  const current = process.env.PATH ?? ''
  if (cachedLoginPath === undefined) {
    try {
      cachedLoginPath = execSync('/bin/bash -ilc "echo $PATH"', { encoding: 'utf-8' }).trim()
    } catch {
      cachedLoginPath = ''
    }
  }
  if (!cachedLoginPath) return current || undefined
  const seen = new Set<string>()
  const merged: string[] = []
  for (const part of [...cachedLoginPath.split(':'), ...current.split(':')]) {
    if (!part || seen.has(part)) continue
    seen.add(part)
    merged.push(part)
  }
  return merged.join(':')
}

function resolveBinary(name: string, searchPath: string | undefined): string | undefined {
  if (!searchPath) return undefined
  for (const dir of searchPath.split(':')) {
    if (!dir) continue
    const full = path.join(dir, name)
    try {
      if (fs.statSync(full).isFile()) return full
    } catch {
      continue
    }
  }
  return undefined
}

interface SkillSearchResult {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

interface SkillSearchResponse {
  query: string
  searchType: string
  skills: SkillSearchResult[]
  count: number
  duration_ms: number
}

interface InstalledSkill {
  name: string
  path: string
  scope: 'project' | 'global'
  description?: string
}

function readSkillDescription(skillDir: string): string | undefined {
  const skillMd = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillMd)) return undefined
  try {
    const content = fs.readFileSync(skillMd, 'utf-8')
    const match = content.match(/^---\s*([\s\S]*?)\s*---/)
    if (!match) return undefined
    const descMatch = match[1].match(/description:\s*(.+)/)
    return descMatch?.[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

function listInstalled(skillsDir: string, scope: 'project' | 'global'): InstalledSkill[] {
  const out: InstalledSkill[] = []
  if (!fs.existsSync(skillsDir)) return out
  let entries: string[]
  try {
    entries = fs.readdirSync(skillsDir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = path.join(skillsDir, name)
    try {
      if (!fs.statSync(full).isDirectory()) continue
    } catch {
      continue
    }
    out.push({
      name,
      path: full,
      scope,
      description: readSkillDescription(full)
    })
  }
  return out
}

function runSkillsCli(
  args: string[],
  cwd: string,
  onChunk: (chunk: string) => void
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const pathEnv = resolvedPath()
    const npxPath = resolveBinary('npx', pathEnv) ?? 'npx'
    const proc = spawn(npxPath, ['-y', 'skills', ...args], {
      cwd,
      env: { ...process.env, PATH: pathEnv, CI: '1', FORCE_COLOR: '0' },
      shell: false
    })
    let output = ''
    const push = (data: Buffer): void => {
      const chunk = data.toString()
      output += chunk
      onChunk(chunk)
    }
    proc.stdout.on('data', push)
    proc.stderr.on('data', push)
    proc.on('error', (err) => {
      const msg = `\nError: ${err.message}\n`
      output += msg
      onChunk(msg)
      resolve({ code: -1, output })
    })
    proc.on('close', (code) => resolve({ code: code ?? 0, output }))
  })
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:search', async (_event, query: string): Promise<SkillSearchResponse> => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      return { query: trimmed, searchType: 'fuzzy', skills: [], count: 0, duration_ms: 0 }
    }
    const url = `https://skills.sh/api/search?q=${encodeURIComponent(trimmed)}&limit=30`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`skills.sh search failed: ${r.status}`)
    return (await r.json()) as SkillSearchResponse
  })

  ipcMain.handle(
    'skills:list',
    (_event, projectPath: string | null): InstalledSkill[] => {
      const global = listInstalled(path.join(os.homedir(), '.claude', 'skills'), 'global')
      if (!projectPath) return global
      const project = listInstalled(path.join(projectPath, '.claude', 'skills'), 'project')
      return [...project, ...global]
    }
  )

  ipcMain.handle(
    'skills:install',
    async (
      event,
      repo: string,
      skillId: string,
      scope: 'project' | 'global',
      projectPath: string | null
    ): Promise<{ code: number; output: string }> => {
      const args = ['add', repo, '-s', skillId, '-a', 'claude-code', '--copy', '-y']
      if (scope === 'global') args.push('-g')
      const cwd =
        scope === 'project' && projectPath ? projectPath : os.homedir()
      const win = BrowserWindow.fromWebContents(event.sender)
      return runSkillsCli(args, cwd, (chunk) => {
        win?.webContents.send('skills:output', chunk)
      })
    }
  )

  ipcMain.handle(
    'skills:uninstall',
    async (
      event,
      skillName: string,
      scope: 'project' | 'global',
      projectPath: string | null
    ): Promise<{ code: number; output: string }> => {
      const args = ['remove', skillName, '-y']
      if (scope === 'global') args.push('-g')
      const cwd =
        scope === 'project' && projectPath ? projectPath : os.homedir()
      const win = BrowserWindow.fromWebContents(event.sender)
      return runSkillsCli(args, cwd, (chunk) => {
        win?.webContents.send('skills:output', chunk)
      })
    }
  )
}
