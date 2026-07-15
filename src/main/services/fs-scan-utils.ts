import fs from 'fs'
import path from 'path'
import ignore, { type Ignore } from 'ignore'

export function toPosix(rel: string): string {
  return rel.split(path.sep).join('/')
}

export class GitignoreMatcher {
  private readonly rootPath: string
  private readonly dirIgnores = new Map<string, Ignore | null>()

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  invalidateDir(dirAbs: string): void {
    this.dirIgnores.delete(dirAbs)
  }

  private getDirIgnore(dirAbs: string): Ignore | null {
    const cached = this.dirIgnores.get(dirAbs)
    if (cached !== undefined) return cached
    let ig: Ignore | null = null
    try {
      const content = fs.readFileSync(path.join(dirAbs, '.gitignore'), 'utf-8')
      ig = ignore().add(content)
    } catch {
      ig = null
    }
    this.dirIgnores.set(dirAbs, ig)
    return ig
  }

  ignores(fullPath: string, isDirectory: boolean): boolean {
    const relToRoot = path.relative(this.rootPath, fullPath)
    if (!relToRoot || relToRoot === '.' || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      return false
    }
    let base = this.rootPath
    const segments = toPosix(relToRoot).split('/')
    for (let i = 0; i < segments.length; i++) {
      const ig = this.getDirIgnore(base)
      if (ig) {
        const rel = segments.slice(i).join('/')
        if (ig.ignores(rel)) return true
        if (isDirectory && ig.ignores(rel + '/')) return true
      }
      base = path.join(base, segments[i])
    }
    return false
  }
}

export function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: Array<() => void> = []
  const release = (): void => {
    active--
    const next = queue.shift()
    if (next) next()
  }
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active++
        fn().then(resolve, reject).finally(release)
      }
      if (active < max) run()
      else queue.push(run)
    })
}
