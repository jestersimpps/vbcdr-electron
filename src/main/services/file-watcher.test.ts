import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  BrowserWindow: class {}
}))

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const writeFile = (rel: string, content = ''): string => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
  return p
}

const writeDir = (rel: string): void => {
  fs.mkdirSync(path.join(root, rel), { recursive: true })
}

describe('readTree', () => {
  it('returns the root with directory metadata and walks children', async () => {
    writeFile('a.ts', '')
    writeDir('src')
    writeFile('src/main.ts', '')

    const { readTree } = await import('./file-watcher')
    const tree = readTree(root)

    expect(tree.isDirectory).toBe(true)
    expect(tree.name).toBe(path.basename(root))
    expect(tree.path).toBe(root)
    expect(tree.children?.map((c) => c.name).sort()).toEqual(['a.ts', 'src'])
  })

  it('always ignores .git, node_modules, .DS_Store', async () => {
    writeDir('.git')
    writeFile('.git/HEAD', '')
    writeDir('node_modules')
    writeFile('node_modules/x.js', '')
    writeFile('.DS_Store', '')
    writeFile('keep.ts', '')

    const { readTree } = await import('./file-watcher')
    const tree = readTree(root)
    const names = tree.children?.map((c) => c.name) ?? []
    expect(names).toEqual(['keep.ts'])
  })

  it('respects .gitignore by default for files', async () => {
    writeFile('.gitignore', 'secret.env\n')
    writeFile('secret.env', 'shh')
    writeFile('readme.md', '')

    const { readTree } = await import('./file-watcher')
    const tree = readTree(root)
    const names = tree.children?.map((c) => c.name).sort() ?? []
    expect(names).toEqual(['.gitignore', 'readme.md'])
  })

  it('flags gitignored entries with isGitignored when showIgnored=true', async () => {
    writeFile('.gitignore', 'secret.env\n')
    writeFile('secret.env', 'shh')
    writeFile('app.ts', '')

    const { readTree } = await import('./file-watcher')
    const tree = readTree(root, true)
    const secret = tree.children?.find((c) => c.name === 'secret.env')
    expect(secret).toBeDefined()
    expect(secret?.isGitignored).toBe(true)
    const app = tree.children?.find((c) => c.name === 'app.ts')
    expect(app?.isGitignored).toBeUndefined()
  })

  it('sorts directories before files, then alphabetically', async () => {
    writeFile('zfile.ts', '')
    writeDir('alpha')
    writeFile('beta.md', '')
    writeDir('zeta')

    const { readTree } = await import('./file-watcher')
    const tree = readTree(root)
    expect(tree.children?.map((c) => c.name)).toEqual(['alpha', 'zeta', 'beta.md', 'zfile.ts'])
  })

  it('honours the maxDepth limit by truncating deeper subtrees', async () => {
    writeFile('lvl0.ts', '')
    writeDir('a')
    writeFile('a/lvl1.ts', '')
    writeDir('a/b')
    writeFile('a/b/lvl2.ts', '')

    const { readTree } = await import('./file-watcher')
    const tree = readTree(root, false, 1)
    const a = tree.children?.find((c) => c.name === 'a')
    const b = a?.children?.find((c) => c.name === 'b')
    expect(b).toBeDefined()
    expect(b?.children).toEqual([])
  })

  it('returns an empty children array when readdir throws (e.g., permission denied)', async () => {
    const { readTree } = await import('./file-watcher')
    const tree = readTree(path.join(root, 'does-not-exist'))
    expect(tree.children).toEqual([])
  })
})

describe('readFileContents', () => {
  it('reads utf-8 text files as plain content', async () => {
    const filePath = writeFile('a.ts', 'const x = 1')
    const { readFileContents } = await import('./file-watcher')
    expect(readFileContents(filePath)).toEqual({ content: 'const x = 1', isBinary: false })
  })

  it('returns base64 + isBinary=true for image files', async () => {
    const filePath = path.join(root, 'pic.png')
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    fs.writeFileSync(filePath, buf)
    const { readFileContents } = await import('./file-watcher')
    const result = readFileContents(filePath)
    expect(result.isBinary).toBe(true)
    expect(result.content).toBe(buf.toString('base64'))
  })

  it('returns SVG as utf-8 with isBinary=true', async () => {
    const filePath = writeFile('icon.svg', '<svg/>')
    const { readFileContents } = await import('./file-watcher')
    expect(readFileContents(filePath)).toEqual({ content: '<svg/>', isBinary: true })
  })

  it('returns base64 + isBinary=true for office and audio files', async () => {
    const audio = path.join(root, 'song.mp3')
    fs.writeFileSync(audio, Buffer.from([1, 2, 3]))
    const { readFileContents } = await import('./file-watcher')
    const result = readFileContents(audio)
    expect(result.isBinary).toBe(true)
    expect(result.content).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })

  it('returns empty content with isBinary=true for unsupported binary extensions', async () => {
    const filePath = path.join(root, 'video.mp4')
    fs.writeFileSync(filePath, Buffer.from([0]))
    const { readFileContents } = await import('./file-watcher')
    expect(readFileContents(filePath)).toEqual({ content: '', isBinary: true })
  })
})

describe('stopWatching', () => {
  it('is safe to call when no watcher is active', async () => {
    const { stopWatching } = await import('./file-watcher')
    expect(() => stopWatching()).not.toThrow()
  })
})
