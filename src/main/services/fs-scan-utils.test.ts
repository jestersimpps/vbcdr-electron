import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { GitignoreMatcher, createLimiter, toPosix } from './fs-scan-utils'

describe('toPosix', () => {
  it('converts platform separators to forward slashes', () => {
    expect(toPosix(['a', 'b', 'c'].join(path.sep))).toBe('a/b/c')
  })
})

describe('GitignoreMatcher', () => {
  let root = ''

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('matches patterns from the root .gitignore', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist\n*.log\n')
    const matcher = new GitignoreMatcher(root)
    expect(matcher.ignores(path.join(root, 'dist'), true)).toBe(true)
    expect(matcher.ignores(path.join(root, 'debug.log'), false)).toBe(true)
    expect(matcher.ignores(path.join(root, 'src'), true)).toBe(false)
  })

  it('respects nested .gitignore files relative to their own directory', () => {
    fs.mkdirSync(path.join(root, 'sub'))
    fs.writeFileSync(path.join(root, 'sub', '.gitignore'), 'secret.txt\n')
    const matcher = new GitignoreMatcher(root)
    expect(matcher.ignores(path.join(root, 'sub', 'secret.txt'), false)).toBe(true)
    expect(matcher.ignores(path.join(root, 'secret.txt'), false)).toBe(false)
    expect(matcher.ignores(path.join(root, 'sub', 'other.txt'), false)).toBe(false)
  })

  it('matches directory-only patterns against directories', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'build/\n')
    const matcher = new GitignoreMatcher(root)
    expect(matcher.ignores(path.join(root, 'build'), true)).toBe(true)
    expect(matcher.ignores(path.join(root, 'build'), false)).toBe(false)
  })

  it('never ignores the root itself or paths outside the root', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), '*\n')
    const matcher = new GitignoreMatcher(root)
    expect(matcher.ignores(root, true)).toBe(false)
    expect(matcher.ignores(path.join(root, '..', 'elsewhere'), true)).toBe(false)
  })

  it('picks up an added .gitignore after invalidateDir', () => {
    const matcher = new GitignoreMatcher(root)
    expect(matcher.ignores(path.join(root, 'tmp.txt'), false)).toBe(false)
    fs.writeFileSync(path.join(root, '.gitignore'), 'tmp.txt\n')
    expect(matcher.ignores(path.join(root, 'tmp.txt'), false)).toBe(false)
    matcher.invalidateDir(root)
    expect(matcher.ignores(path.join(root, 'tmp.txt'), false)).toBe(true)
  })
})

describe('createLimiter', () => {
  it('never runs more than the configured number of tasks at once', async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0
    const task = (): Promise<void> =>
      new Promise((resolve) => {
        active++
        peak = Math.max(peak, active)
        setTimeout(() => {
          active--
          resolve()
        }, 5)
      })
    await Promise.all(Array.from({ length: 6 }, () => limit(task)))
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('resolves with the task result and keeps the queue draining', async () => {
    const limit = createLimiter(1)
    const results = await Promise.all([
      limit(async () => 'a'),
      limit(async () => 'b'),
      limit(async () => 'c')
    ])
    expect(results).toEqual(['a', 'b', 'c'])
  })

  it('propagates rejections without blocking queued tasks', async () => {
    const limit = createLimiter(1)
    const failing = limit(async () => {
      throw new Error('boom')
    })
    const following = limit(async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    await expect(following).resolves.toBe('ok')
  })
})
