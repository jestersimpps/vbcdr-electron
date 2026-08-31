import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { MAX_FILES, scanTsProject } from './ts-project-scanner'

let root = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsscan-'))
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}')
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(root, 'b.ts'), 'export const b = 2\n')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('scanTsProject', () => {
  it('returns all files with hashes on a first scan', async () => {
    const result = await scanTsProject(root)
    const uris = Object.keys(result.files)
    expect(uris).toHaveLength(2)
    expect(result.currentUris).toHaveLength(2)
    for (const uri of uris) {
      expect(result.hashes[uri]).toBeTypeOf('number')
      expect(result.currentUris).toContain(uri)
    }
    expect(result.tsconfigFound).toBe(true)
    expect(result.compilerOptions.strict).toBe(true)
  })

  it('sends nothing back when known hashes match', async () => {
    const first = await scanTsProject(root)
    const second = await scanTsProject(root, first.hashes)
    expect(Object.keys(second.files)).toHaveLength(0)
    expect(second.currentUris.sort()).toEqual(first.currentUris.sort())
  })

  it('sends only modified and new files on a rescan', async () => {
    const first = await scanTsProject(root)
    const aPath = path.join(root, 'a.ts')
    fs.writeFileSync(aPath, 'export const a = 42\n')
    const future = (Date.now() + 5000) / 1000
    fs.utimesSync(aPath, future, future)
    fs.writeFileSync(path.join(root, 'c.ts'), 'export const c = 3\n')

    const second = await scanTsProject(root, first.hashes)
    const changed = Object.keys(second.files).sort()
    expect(changed).toEqual([`file://${aPath}`, `file://${path.join(root, 'c.ts')}`])
    expect(second.currentUris).toHaveLength(3)
  })

  it('reports removed files via currentUris', async () => {
    const first = await scanTsProject(root)
    fs.rmSync(path.join(root, 'b.ts'))
    const second = await scanTsProject(root, first.hashes)
    expect(second.currentUris).toHaveLength(1)
    expect(second.currentUris[0]).toBe(`file://${path.join(root, 'a.ts')}`)
  })

  it('caps the scan at MAX_FILES files', async () => {
    for (let i = 0; i < MAX_FILES + 10; i++) {
      fs.writeFileSync(path.join(root, `file-${i}.ts`), `export const value${i} = ${i}\n`)
    }

    const result = await scanTsProject(root)

    expect(result.currentUris).toHaveLength(MAX_FILES)
    expect(result.truncated).toBe(true)
  })

  it('does not truncate a project with fewer than MAX_FILES files', async () => {
    const result = await scanTsProject(root)

    expect(result.currentUris.length).toBeLessThan(MAX_FILES)
    expect(result.truncated).toBe(false)
  })

  it('still enforces the byte cap independently of the file cap', async () => {
    const content = 'x'.repeat(250 * 1024)
    for (let i = 0; i < 55; i++) {
      fs.writeFileSync(path.join(root, `large-${i}.ts`), content)
    }

    const result = await scanTsProject(root)

    expect(result.truncated).toBe(true)
    expect(result.currentUris.length).toBeLessThan(100)
    expect(result.currentUris.length).toBeLessThan(MAX_FILES)
  })

  it('skips oversized files without consuming file-count slots', async () => {
    fs.rmSync(path.join(root, 'a.ts'))
    fs.rmSync(path.join(root, 'b.ts'))
    fs.writeFileSync(path.join(root, 'oversized.ts'), 'x'.repeat(256 * 1024 + 1))
    for (let i = 0; i < MAX_FILES; i++) {
      fs.writeFileSync(path.join(root, `small-${i}.ts`), `export const value${i} = ${i}\n`)
    }

    const result = await scanTsProject(root)

    expect(result.currentUris).toHaveLength(MAX_FILES)
    expect(result.currentUris).not.toContain(`file://${path.join(root, 'oversized.ts')}`)
  })
})
