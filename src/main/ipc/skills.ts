import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, execSync } from 'child_process'
import { ipcMain, BrowserWindow } from 'electron'

let cachedLoginPath: string | undefined

const IS_WINDOWS = process.platform === 'win32'
const PATH_SEP = IS_WINDOWS ? ';' : ':'
const NPX_NAMES = IS_WINDOWS ? ['npx.cmd', 'npx.exe', 'npx'] : ['npx']

function isPosixShell(shell: string): boolean {
  const base = path.basename(shell)
  return base === 'bash' || base === 'zsh' || base === 'sh' || base === 'dash' || base === 'ksh'
}

function queryLoginPath(shell: string): string {
  try {
    const cmd = isPosixShell(shell)
      ? `"${shell}" -ilc 'echo $PATH'`
      : `"${shell}" -lc 'echo $PATH'`
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 3000 }).trim()
    return out.includes(PATH_SEP) ? out : ''
  } catch {
    return ''
  }
}

function resolvedPath(): string | undefined {
  const current = process.env.PATH ?? ''
  if (IS_WINDOWS) return current || undefined
  if (cachedLoginPath === undefined) {
    const userShell = process.env.SHELL || '/bin/zsh'
    cachedLoginPath = queryLoginPath(userShell)
    if (!cachedLoginPath && path.basename(userShell) !== 'bash') {
      cachedLoginPath = queryLoginPath('/bin/bash')
    }
  }
  if (!cachedLoginPath) return current || undefined
  const seen = new Set<string>()
  const merged: string[] = []
  for (const part of [...cachedLoginPath.split(PATH_SEP), ...current.split(PATH_SEP)]) {
    if (!part || seen.has(part)) continue
    seen.add(part)
    merged.push(part)
  }
  return merged.join(PATH_SEP)
}

function resolveBinary(names: string[], searchPath: string | undefined): string | undefined {
  if (!searchPath) return undefined
  for (const dir of searchPath.split(PATH_SEP)) {
    if (!dir) continue
    for (const name of names) {
      const full = path.join(dir, name)
      try {
        if (fs.statSync(full).isFile()) return full
      } catch {
        continue
      }
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

function parseInstallCount(raw: string): number {
  const m = raw.trim().match(/^([\d.,]+)\s*([KMB]?)/i)
  if (!m) return 0
  const n = parseFloat(m[1].replace(/,/g, ''))
  if (!isFinite(n)) return 0
  const suffix = m[2].toUpperCase()
  if (suffix === 'K') return Math.round(n * 1_000)
  if (suffix === 'M') return Math.round(n * 1_000_000)
  if (suffix === 'B') return Math.round(n * 1_000_000_000)
  return Math.round(n)
}

const RESERVED_PATHS = new Set([
  'trending', 'hot', 'about', 'docs', 'login', 'logout', 'signup', 'api', 'search',
  'leaderboard', 'submit', 'dashboard', 'settings', 'privacy', 'terms', 'pricing',
  'browse', 'new', 'all', 'latest', 'popular'
])

export function parseTopSkills(html: string, limit = 30): SkillSearchResult[] {
  const out: SkillSearchResult[] = []
  const seen = new Set<string>()
  const anchorRe = /<a[^>]+href="\/([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const installsRe = /([\d.,]+\s*[KMB]?)\s*installs?/i
  let match: RegExpExecArray | null
  const anchors: Array<{ path: string; index: number }> = []
  while ((match = anchorRe.exec(html)) !== null) {
    anchors.push({ path: match[1], index: match.index + match[0].length })
  }
  for (const { path: hrefPath, index } of anchors) {
    const segments = hrefPath.split('/').filter(Boolean)
    if (segments.length !== 3) continue
    const [owner, repo, skillId] = segments
    if (RESERVED_PATHS.has(owner)) continue
    const id = `${owner}/${repo}/${skillId}`
    if (seen.has(id)) continue
    const window = html.slice(index, index + 600)
    const installsMatch = window.match(installsRe)
    if (!installsMatch) continue
    seen.add(id)
    out.push({
      id,
      skillId,
      name: skillId,
      installs: parseInstallCount(installsMatch[1]),
      source: `${owner}/${repo}`
    })
    if (out.length >= limit) break
  }
  return out
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
    const npxPath = resolveBinary(NPX_NAMES, pathEnv) ?? 'npx'
    const proc = spawn(npxPath, ['-y', 'skills', ...args], {
      cwd,
      env: { ...process.env, PATH: pathEnv, CI: '1', FORCE_COLOR: '0' },
      shell: IS_WINDOWS
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

  ipcMain.handle('skills:top', async (): Promise<SkillSearchResult[]> => {
    const r = await fetch('https://skills.sh/')
    if (!r.ok) throw new Error(`skills.sh top failed: ${r.status}`)
    const html = await r.text()
    return parseTopSkills(html)
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
