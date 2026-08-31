import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  BrowserWindow: class {}
}))

interface FakeWatcher {
  root: string
  emit: (eventType: string, filename: string | null) => void
  emitError: (err: Error) => void
  close: ReturnType<typeof vi.fn>
}

const watchers: FakeWatcher[] = []
let recursiveWatchThrows = false

// startWatching uses ONE recursive fs.watch rather than a watcher per directory,
// so the mock stands in for that single watch and records how it was configured.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: {
      ...actual,
      watch: (root: string, opts: { recursive?: boolean }) => {
        if (recursiveWatchThrows) throw new Error('recursive watch unsupported')
        expect(opts?.recursive).toBe(true)
        let changeCb: ((e: string, f: string | null) => void) | null = null
        let errorCb: ((e: Error) => void) | null = null
        const close = vi.fn()
        watchers.push({
          root,
          emit: (eventType, filename) => changeCb?.(eventType, filename),
          emitError: (err) => errorCb?.(err),
          close
        })
        return {
          on(event: string, cb: (...args: never[]) => void) {
            if (event === 'change') changeCb = cb as never
            if (event === 'error') errorCb = cb as never
            return this
          },
          close
        }
      }
    }
  }
})

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'))
  watchers.length = 0
  recursiveWatchThrows = false
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
    const tree = await readTree(root)

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
    const tree = await readTree(root)
    const names = tree.children?.map((c) => c.name) ?? []
    expect(names).toEqual(['keep.ts'])
  })

  it('respects .gitignore by default for files', async () => {
    writeFile('.gitignore', 'secret.env\n')
    writeFile('secret.env', 'shh')
    writeFile('readme.md', '')

    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root)
    const names = tree.children?.map((c) => c.name).sort() ?? []
    expect(names).toEqual(['.gitignore', 'readme.md'])
  })

  it('flags gitignored entries with isGitignored when showIgnored=true', async () => {
    writeFile('.gitignore', 'secret.env\n')
    writeFile('secret.env', 'shh')
    writeFile('app.ts', '')

    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root, true)
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
    const tree = await readTree(root)
    expect(tree.children?.map((c) => c.name)).toEqual(['alpha', 'zeta', 'beta.md', 'zfile.ts'])
  })

  it('honours the maxDepth limit by truncating deeper subtrees', async () => {
    writeFile('lvl0.ts', '')
    writeDir('a')
    writeFile('a/lvl1.ts', '')
    writeDir('a/b')
    writeFile('a/b/lvl2.ts', '')

    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root, false, 1)
    const a = tree.children?.find((c) => c.name === 'a')
    const b = a?.children?.find((c) => c.name === 'b')
    expect(b).toBeDefined()
    expect(b?.children).toEqual([])
  })

  it('returns an empty children array when readdir throws (e.g., permission denied)', async () => {
    const { readTree } = await import('./file-watcher')
    const tree = await readTree(path.join(root, 'does-not-exist'))
    expect(tree.children).toEqual([])
  })

  it('respects nested .gitignore files (submodule-style)', async () => {
    writeFile('.gitignore', 'rootonly.txt\n')
    writeFile('rootonly.txt', '')
    writeFile('sub/.gitignore', 'vendor/\n*.log\n')
    writeFile('sub/vendor/big.js', '')
    writeFile('sub/debug.log', '')
    writeFile('sub/keep.js', '')

    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root)
    const sub = tree.children?.find((c) => c.name === 'sub')
    const names = sub?.children?.map((c) => c.name).sort() ?? []
    expect(names).toEqual(['.gitignore', 'keep.js'])
    expect(tree.children?.some((c) => c.name === 'rootonly.txt')).toBe(false)
  })

  it('does not apply nested .gitignore patterns to sibling directories', async () => {
    writeFile('sub/.gitignore', 'generated/\n')
    writeFile('sub/generated/x.js', '')
    writeFile('other/generated/y.js', '')

    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub?.children?.some((c) => c.name === 'generated')).toBe(false)
    const other = tree.children?.find((c) => c.name === 'other')
    expect(other?.children?.some((c) => c.name === 'generated')).toBe(true)
  })

  it('caps the tree at maxNodes and flags the root as truncated', async () => {
    for (let i = 0; i < 10; i++) writeFile(`f${i}.ts`, '')

    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root, false, 10, 3)
    expect(tree.truncated).toBe(true)
    expect(tree.children?.length).toBe(3)
  })

  it('leaves truncated unset when the tree fits within maxNodes', async () => {
    writeFile('a.ts', '')
    const { readTree } = await import('./file-watcher')
    const tree = await readTree(root)
    expect(tree.truncated).toBeUndefined()
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

  it('closes the active recursive watcher', async () => {
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

  it('opens exactly ONE recursive watcher for the whole project', async () => {
    writeDir('a/b/c')
    writeDir('d/e/f')
    const { startWatching } = await import('./file-watcher')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    startWatching(root, win as never)

    // The bug this guards: one descriptor per directory exhausts the fd limit
    // on a large repo (5,606 directories measured) and floods the main process
    // with EMFILE rejections.
    expect(watchers).toHaveLength(1)
    expect(watchers[0].root).toBe(root)
  })

  it('debounces rename events into a single fs:tree-changed event', async () => {
    writeFile('a.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('rename', 'a.ts')
    watchers[0].emit('rename', 'a.ts')
    expect(send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => {
      expect(send.mock.calls.some((c) => c[0] === 'fs:tree-changed')).toBe(true)
    })
    const treeCalls = send.mock.calls.filter((c) => c[0] === 'fs:tree-changed')
    expect(treeCalls).toHaveLength(1)
    expect(treeCalls[0][1]).toMatchObject({ path: root, isDirectory: true })
  })

  it('rescans the tree when fs.watch reports no filename', async () => {
    writeFile('a.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('rename', null)

    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => {
      expect(send.mock.calls.some((c) => c[0] === 'fs:tree-changed')).toBe(true)
    })
  })

  it('reads the changed text file and sends fs:file-changed after the file debounce', async () => {
    const filePath = writeFile('a.ts', 'initial')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    fs.writeFileSync(filePath, 'updated')
    watchers[0].emit('change', 'a.ts')

    vi.advanceTimersByTime(150)
    const fileCalls = send.mock.calls.filter((c) => c[0] === 'fs:file-changed')
    expect(fileCalls).toHaveLength(1)
    expect(fileCalls[0]).toEqual(['fs:file-changed', filePath, 'updated'])
  })

  it('skips file content reads for binary extensions on change events', async () => {
    writeFile('pic.png', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('change', 'pic.png')
    vi.advanceTimersByTime(200)

    expect(send.mock.calls.some((c) => c[0] === 'fs:file-changed')).toBe(false)
  })

  it('does not throw when the changed file disappears before the read fires', async () => {
    const filePath = writeFile('temp.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('change', 'temp.ts')
    fs.rmSync(filePath)
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
    expect(send.mock.calls.some((c) => c[0] === 'fs:file-changed')).toBe(false)
  })

  it('ignores events for .git, node_modules and gitignored paths', async () => {
    writeFile('.gitignore', 'secret.env\n')
    writeFile('secret.env', 'shh')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    watchers[0].emit('change', path.join('.git', 'index'))
    watchers[0].emit('change', path.join('node_modules', 'x.js'))
    watchers[0].emit('change', path.join('deep', 'node_modules', 'y.js'))
    watchers[0].emit('change', 'secret.env')
    watchers[0].emit('rename', path.join('.git', 'refs', 'heads', 'main'))

    await vi.advanceTimersByTimeAsync(700)
    expect(send).not.toHaveBeenCalled()
  })

  it('stops emitting once the window is destroyed', async () => {
    writeFile('a.ts', '')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    let destroyed = false
    const win = { isDestroyed: () => destroyed, webContents: { send } }
    startWatching(root, win as never)

    destroyed = true
    watchers[0].emit('rename', 'a.ts')
    await vi.advanceTimersByTimeAsync(600)
    await Promise.resolve()
    expect(send).not.toHaveBeenCalled()
  })

  it('survives a watcher error instead of leaving an unhandled rejection', async () => {
    const { startWatching } = await import('./file-watcher')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    startWatching(root, win as never)

    const emfile = Object.assign(new Error('EMFILE: too many open files, watch'), { code: 'EMFILE' })
    expect(() => watchers[0].emitError(emfile)).not.toThrow()
    expect(watchers[0].close).toHaveBeenCalled()
  })

  it('degrades gracefully when recursive watching is unsupported', async () => {
    recursiveWatchThrows = true
    const { startWatching } = await import('./file-watcher')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }

    expect(() => startWatching(root, win as never)).not.toThrow()
    expect(watchers).toHaveLength(0)
  })

  it('picks up .gitignore edits and schedules a tree rescan', async () => {
    const gitignorePath = writeFile('sub/.gitignore', 'vendor/\n')
    const { startWatching } = await import('./file-watcher')
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    startWatching(root, win as never)

    fs.writeFileSync(gitignorePath, '')
    watchers[0].emit('change', path.join('sub', '.gitignore'))

    await vi.advanceTimersByTimeAsync(700)
    await vi.waitFor(() => {
      expect(send.mock.calls.some((c) => c[0] === 'fs:tree-changed')).toBe(true)
    })
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

describe('isIgnoredPath', () => {
  it('ignores the always-ignore list at any depth', async () => {
    const { isIgnoredPath } = await import('./file-watcher')
    const { GitignoreMatcher } = await import('./fs-scan-utils')
    const m = new GitignoreMatcher(root)

    expect(isIgnoredPath(root, m, path.join(root, '.git', 'HEAD'), false)).toBe(true)
    expect(isIgnoredPath(root, m, path.join(root, 'node_modules', 'x.js'), false)).toBe(true)
    expect(isIgnoredPath(root, m, path.join(root, 'a', 'b', 'node_modules', 'x.js'), false)).toBe(true)
    expect(isIgnoredPath(root, m, path.join(root, '.DS_Store'), false)).toBe(true)
    expect(isIgnoredPath(root, m, path.join(root, 'src', 'main.ts'), false)).toBe(false)
  })

  it('never ignores the root itself', async () => {
    const { isIgnoredPath } = await import('./file-watcher')
    const { GitignoreMatcher } = await import('./fs-scan-utils')
    expect(isIgnoredPath(root, new GitignoreMatcher(root), root, true)).toBe(false)
  })

  it('ignores paths outside the root', async () => {
    const { isIgnoredPath } = await import('./file-watcher')
    const { GitignoreMatcher } = await import('./fs-scan-utils')
    const m = new GitignoreMatcher(root)
    expect(isIgnoredPath(root, m, path.join(root, '..', 'elsewhere.ts'), false)).toBe(true)
  })

  it('respects root and nested .gitignore files', async () => {
    writeFile('.gitignore', 'secret.env\n')
    writeFile('sub/.gitignore', 'vendor/\n')
    const { isIgnoredPath } = await import('./file-watcher')
    const { GitignoreMatcher } = await import('./fs-scan-utils')
    const m = new GitignoreMatcher(root)

    expect(isIgnoredPath(root, m, path.join(root, 'secret.env'), false)).toBe(true)
    expect(isIgnoredPath(root, m, path.join(root, 'sub', 'vendor'), true)).toBe(true)
    expect(isIgnoredPath(root, m, path.join(root, 'sub', 'keep.js'), false)).toBe(false)
    expect(isIgnoredPath(root, m, path.join(root, 'other', 'vendor'), true)).toBe(false)
  })
})
