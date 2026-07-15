import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

const SOURCE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'])
const DTS_EXT_RE = /\.d\.[cm]?ts$/
const MAX_FILE_BYTES = 256 * 1024
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const ALWAYS_SKIP = new Set([
  '.git', 'dist', 'build', 'out', '.next', '.turbo', '.vercel', 'coverage',
  '.cache', '.parcel-cache', '.svelte-kit', '.nuxt', '.output', 'tmp', 'temp'
])

export interface TsProjectScanResult {
  rootPath: string
  tsconfigFound: boolean
  compilerOptions: Record<string, unknown>
  files: Record<string, string>
  hashes: Record<string, number>
  currentUris: string[]
  truncated: boolean
}

interface FileMeta {
  mtimeMs: number
  size: number
  hash: number
}

interface ScanContext {
  changed: Map<string, string>
  hashes: Map<string, number>
  currentUris: string[]
  knownHashes: Record<string, number> | null
  prevManifest: Map<string, FileMeta> | null
  manifest: Map<string, FileMeta>
  byteBudget: { used: number }
}

const MAX_CACHED_MANIFESTS = 3
const manifestCache = new Map<string, Map<string, FileMeta>>()

// must stay identical to simpleHash in src/renderer/services/monaco-project-loader.ts —
// the renderer sends these hashes back as knownHashes on the next scan
function simpleHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}

async function collectFile(ctx: ScanContext, childAbs: string): Promise<void> {
  let stat: fs.Stats
  try {
    stat = await fsp.stat(childAbs)
  } catch {
    return
  }
  if (stat.size > MAX_FILE_BYTES) return
  const uri = `file://${childAbs}`
  const prev = ctx.prevManifest?.get(childAbs)

  if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
    ctx.manifest.set(childAbs, prev)
    ctx.currentUris.push(uri)
    ctx.byteBudget.used += stat.size
    if (ctx.knownHashes && ctx.knownHashes[uri] === prev.hash) return
    let content: string
    try {
      content = await fsp.readFile(childAbs, 'utf-8')
    } catch {
      return
    }
    ctx.changed.set(uri, content)
    ctx.hashes.set(uri, prev.hash)
    return
  }

  let content: string
  try {
    content = await fsp.readFile(childAbs, 'utf-8')
  } catch {
    return
  }
  const hash = simpleHash(content)
  ctx.manifest.set(childAbs, { mtimeMs: stat.mtimeMs, size: stat.size, hash })
  ctx.currentUris.push(uri)
  ctx.byteBudget.used += content.length
  if (ctx.knownHashes && ctx.knownHashes[uri] === hash) return
  ctx.changed.set(uri, content)
  ctx.hashes.set(uri, hash)
}

interface RawTsconfig {
  extends?: string
  compilerOptions?: Record<string, unknown>
  include?: string[]
  exclude?: string[]
  references?: Array<{ path: string }>
}

function stripJsonComments(input: string): string {
  let out = ''
  let i = 0
  let inString = false
  let stringChar = ''
  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]
    if (inString) {
      out += ch
      if (ch === '\\' && i + 1 < input.length) {
        out += input[i + 1]
        i += 2
        continue
      }
      if (ch === stringChar) inString = false
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    if (ch === ',' ) {
      let j = i + 1
      while (j < input.length && /\s/.test(input[j])) j += 1
      if (input[j] === '}' || input[j] === ']') {
        i += 1
        continue
      }
    }
    out += ch
    i += 1
  }
  return out
}

async function readTsconfigChain(tsconfigPath: string, seen = new Set<string>()): Promise<RawTsconfig | null> {
  const resolved = path.resolve(tsconfigPath)
  if (seen.has(resolved)) return null
  seen.add(resolved)
  let raw: string
  try {
    raw = await fsp.readFile(resolved, 'utf-8')
  } catch {
    return null
  }
  let parsed: RawTsconfig
  try {
    parsed = JSON.parse(stripJsonComments(raw))
  } catch {
    return null
  }
  if (parsed.extends) {
    const base = await resolveExtends(parsed.extends, path.dirname(resolved))
    if (base) {
      const baseConfig = await readTsconfigChain(base, seen)
      if (baseConfig) {
        parsed.compilerOptions = { ...(baseConfig.compilerOptions ?? {}), ...(parsed.compilerOptions ?? {}) }
        if (!parsed.include && baseConfig.include) parsed.include = baseConfig.include
        if (!parsed.exclude && baseConfig.exclude) parsed.exclude = baseConfig.exclude
      }
    }
  }
  return parsed
}

async function resolveExtends(spec: string, fromDir: string): Promise<string | null> {
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    let candidate = path.resolve(fromDir, spec)
    if (!candidate.endsWith('.json')) candidate += '.json'
    try {
      await fsp.access(candidate)
      return candidate
    } catch {
      return null
    }
  }
  let dir = fromDir
  while (true) {
    const nm = path.join(dir, 'node_modules', spec)
    const direct = nm.endsWith('.json') ? nm : `${nm}.json`
    try {
      await fsp.access(direct)
      return direct
    } catch {
      // fall through
    }
    try {
      const pkgPath = path.join(dir, 'node_modules', spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'), 'package.json')
      const pkgRaw = await fsp.readFile(pkgPath, 'utf-8')
      const pkg = JSON.parse(pkgRaw)
      if (pkg.tsconfig) {
        return path.resolve(path.dirname(pkgPath), pkg.tsconfig)
      }
    } catch {
      // fall through
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function shouldIncludePath(relPath: string, excludes: string[]): boolean {
  for (const ex of excludes) {
    if (relPath === ex || relPath.startsWith(ex + '/')) return false
  }
  return true
}

async function walkSources(
  rootPath: string,
  excludes: string[],
  ctx: ScanContext
): Promise<void> {
  async function walk(dirAbs: string, relDir: string): Promise<void> {
    if (ctx.byteBudget.used >= MAX_TOTAL_BYTES) return
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dirAbs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (ctx.byteBudget.used >= MAX_TOTAL_BYTES) return
      if (ALWAYS_SKIP.has(entry.name)) continue
      if (entry.name === 'node_modules') continue
      const childAbs = path.join(dirAbs, entry.name)
      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (!shouldIncludePath(childRel, excludes)) continue
      if (entry.isDirectory()) {
        await walk(childAbs, childRel)
        continue
      }
      if (!entry.isFile()) continue
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      const isDts = DTS_EXT_RE.test(entry.name)
      if (!isDts && !SOURCE_EXTS.has(ext)) continue
      await collectFile(ctx, childAbs)
    }
  }
  await walk(rootPath, '')
}

async function collectTypesPackages(rootPath: string, ctx: ScanContext): Promise<void> {
  const nm = path.join(rootPath, 'node_modules')
  let pkgJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
  try {
    pkgJson = JSON.parse(await fsp.readFile(path.join(rootPath, 'package.json'), 'utf-8'))
  } catch {
    return
  }
  const directDeps = new Set<string>([
    ...Object.keys(pkgJson.dependencies ?? {}),
    ...Object.keys(pkgJson.devDependencies ?? {}),
    ...Object.keys(pkgJson.peerDependencies ?? {})
  ])

  const typesRoot = path.join(nm, '@types')
  try {
    const typesEntries = await fsp.readdir(typesRoot, { withFileTypes: true })
    for (const entry of typesEntries) {
      if (!entry.isDirectory()) continue
      if (ctx.byteBudget.used >= MAX_TOTAL_BYTES) return
      await collectDtsInDir(path.join(typesRoot, entry.name), ctx)
    }
  } catch {
    // no @types — fine
  }

  for (const dep of directDeps) {
    if (ctx.byteBudget.used >= MAX_TOTAL_BYTES) return
    await collectDepTypes(nm, dep, ctx)
  }
}

async function collectDepTypes(
  nmPath: string,
  dep: string,
  ctx: ScanContext
): Promise<void> {
  const depPath = path.join(nmPath, dep)
  let pkg: { types?: string; typings?: string; exports?: Record<string, unknown> }
  try {
    pkg = JSON.parse(await fsp.readFile(path.join(depPath, 'package.json'), 'utf-8'))
  } catch {
    return
  }
  const typesField = pkg.types ?? pkg.typings
  if (typesField) {
    const typesAbs = path.resolve(depPath, typesField)
    const typesDir = path.dirname(typesAbs)
    await collectDtsInDir(typesDir, ctx)
    return
  }
  const fallbackIndex = path.join(depPath, 'index.d.ts')
  try {
    await fsp.access(fallbackIndex)
    await collectDtsInDir(depPath, ctx, 0, 1)
  } catch {
    // no types
  }
}

async function collectDtsInDir(
  dirAbs: string,
  ctx: ScanContext,
  depth: number = 0,
  maxDepth: number = 4
): Promise<void> {
  if (depth > maxDepth) return
  if (ctx.byteBudget.used >= MAX_TOTAL_BYTES) return
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dirAbs, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (ctx.byteBudget.used >= MAX_TOTAL_BYTES) return
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const childAbs = path.join(dirAbs, entry.name)
    if (entry.isDirectory()) {
      await collectDtsInDir(childAbs, ctx, depth + 1, maxDepth)
      continue
    }
    if (!entry.isFile()) continue
    if (!DTS_EXT_RE.test(entry.name)) continue
    await collectFile(ctx, childAbs)
  }
}

export async function scanTsProject(
  rootPath: string,
  knownHashes?: Record<string, number> | null
): Promise<TsProjectScanResult> {
  const tsconfigPath = path.join(rootPath, 'tsconfig.json')
  let tsconfig: RawTsconfig | null = null
  try {
    await fsp.access(tsconfigPath)
    tsconfig = await readTsconfigChain(tsconfigPath)
  } catch {
    tsconfig = null
  }

  const compilerOptions = (tsconfig?.compilerOptions ?? {}) as Record<string, unknown>
  const excludes = (tsconfig?.exclude ?? []).map((e) => e.replace(/^\/+|\/+$/g, ''))
  const ctx: ScanContext = {
    changed: new Map(),
    hashes: new Map(),
    currentUris: [],
    knownHashes: knownHashes ?? null,
    prevManifest: manifestCache.get(rootPath) ?? null,
    manifest: new Map(),
    byteBudget: { used: 0 }
  }

  await walkSources(rootPath, excludes, ctx)
  await collectTypesPackages(rootPath, ctx)

  manifestCache.delete(rootPath)
  manifestCache.set(rootPath, ctx.manifest)
  if (manifestCache.size > MAX_CACHED_MANIFESTS) {
    const oldest = manifestCache.keys().next().value
    if (oldest !== undefined) manifestCache.delete(oldest)
  }

  return {
    rootPath,
    tsconfigFound: tsconfig !== null,
    compilerOptions,
    files: Object.fromEntries(ctx.changed),
    hashes: Object.fromEntries(ctx.hashes),
    currentUris: ctx.currentUris,
    truncated: ctx.byteBudget.used >= MAX_TOTAL_BYTES
  }
}
