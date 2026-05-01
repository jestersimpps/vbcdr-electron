import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  BrowserWindow: class {}
}))

interface FakeWatcher {
  ignored?: (filePath: string) => boolean
  emit: (event: string, filePath: string) => void
  close: ReturnType<typeof vi.fn>
}

const watchers: FakeWatcher[] = []

vi.mock('chokidar', () => ({
  watch: vi.fn((_root: string, opts: { ignored?: (p: string) => boolean }) => {
    let allCb: ((event: string, filePath: string) => void) | null = null
    const watcher: FakeWatcher = {
      ignored: opts.ignored,
      emit: (event, filePath) => allCb?.(event, filePath),
      close: vi.fn()
    }
    watchers.push(watcher)
    return {
      on: (event: string, cb: (event: string, filePath: string) => void) => {
        if (event === 'all') allCb = cb
      },
      close: watcher.close
    }
  })
}))

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'))
  watchers.length = 0
})

afterEach(async () => {
  // Always clear any active watcher between tests so module state is clean.
  const { stopWatching } = await import('./file-watcher')
  stopWatching()
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

  it('closes the active chokidar watcher', async () => {
    const { startWatching, stopWatching } = await import('./file-watcher')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    startWatching(root, win as never)
    expect(watchers).toHaveLength(1)
    stopWatching()
    expect(watchers[0].close).toHaveBeenCalled()
  })
})

describe('startWatching', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces tree changes and emits a single fs:tree-changed event', async () => {
    writeFile('a.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    const watcher = watchers[0]
    watcher.emit('add', path.join(root, 'a.ts'))
    watcher.emit('add', path.join(root, 'a.ts'))
    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    const treeCalls = send.mock.calls.filter((c) => c[0] === 'fs:tree-changed')
    expect(treeCalls).toHaveLength(1)
    expect(treeCalls[0][1]).toMatchObject({ path: root, isDirectory: true })
  })

  it('reads the changed text file and sends fs:file-changed after the file debounce', async () => {
    const filePath = writeFile('a.ts', 'initial')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    fs.writeFileSync(filePath, 'updated')
    watchers[0].emit('change', filePath)

    vi.advanceTimersByTime(150)
    const fileCalls = send.mock.calls.filter((c) => c[0] === 'fs:file-changed')
    expect(fileCalls).toHaveLength(1)
    expect(fileCalls[0]).toEqual(['fs:file-changed', filePath, 'updated'])
  })

  it('skips file content reads for binary extensions on change events', async () => {
    const filePath = writeFile('pic.png', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('change', filePath)
    vi.advanceTimersByTime(200)

    expect(send.mock.calls.some((c) => c[0] === 'fs:file-changed')).toBe(false)
  })

  it('does not throw when the changed file disappears before the read fires', async () => {
    const filePath = writeFile('temp.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('change', filePath)
    fs.rmSync(filePath)
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
    expect(send.mock.calls.some((c) => c[0] === 'fs:file-changed')).toBe(false)
  })

  it('stops emitting once the window is destroyed', async () => {
    writeFile('a.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    let destroyed = false
    const win = { isDestroyed: () => destroyed, webContents: { send } }
    startWatching(root, win as never)

    destroyed = true
    watchers[0].emit('add', path.join(root, 'a.ts'))
    vi.advanceTimersByTime(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('configures chokidar to ignore .git, node_modules and gitignored paths', async () => {
    writeFile('.gitignore', 'secret.env\n')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    const ignored = watchers[0].ignored!
    expect(ignored(path.join(root, '.git', 'HEAD'))).toBe(true)
    expect(ignored(path.join(root, 'node_modules', 'x.js'))).toBe(true)
    expect(ignored(path.join(root, 'secret.env'))).toBe(true)
    expect(ignored(path.join(root, 'src', 'main.ts'))).toBe(false)
    expect(ignored(root)).toBe(false)
  })

  it('includes gitignored paths in the watcher when showIgnored=true', async () => {
    writeFile('.gitignore', 'secret.env\n')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never, true)

    const ignored = watchers[0].ignored!
    expect(ignored(path.join(root, 'secret.env'))).toBe(false)
    expect(ignored(path.join(root, '.git', 'HEAD'))).toBe(true)
  })

  it('replaces a previous watcher when called twice', async () => {
    const { startWatching } = await import('./file-watcher')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    startWatching(root, win as never)
    startWatching(root, win as never)

    expect(watchers).toHaveLength(2)
    expect(watchers[0].close).toHaveBeenCalled()
  })
})
