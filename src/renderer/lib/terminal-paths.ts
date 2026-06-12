export function shellEscape(path: string): string {
  if (/[^a-zA-Z0-9_./:@~=-]/.test(path)) {
    return "'" + path.replace(/'/g, "'\\''") + "'"
  }
  return path
}

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p)
}

export function resolveAgainstCwd(rawPath: string, cwd: string): string {
  if (isAbsolutePath(rawPath)) return rawPath
  const cleaned = rawPath.replace(/^\.\//, '')
  const base = cwd.replace(/[\\/]+$/, '')
  return `${base}/${cleaned}`
}

export function relativeToCwd(absolutePath: string, cwd: string): string {
  const base = cwd.replace(/[\\/]+$/, '')
  if (absolutePath === base) return '.'
  if (absolutePath.startsWith(base + '/')) return absolutePath.slice(base.length + 1)
  return absolutePath
}
