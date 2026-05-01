import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SEP = '<<SEP>>'

interface GitCall { args: string[]; cwd?: string }
const calls: GitCall[] = []
let nextOutputs: Array<string | Error> = []

vi.mock('child_process', () => ({
  default: {
    execFile: (
      _cmd: string,
      args: string[],
      opts: { cwd?: string },
      cb: (err: Error | null, result: { stdout: string }) => void
    ) => {
      calls.push({ args, cwd: opts?.cwd })
      const out = nextOutputs.shift()
      if (out instanceof Error) {
        cb(out, { stdout: '' })
      } else {
        cb(null, { stdout: out ?? '' })
      }
    }
  },
  execFile: (
    _cmd: string,
    args: string[],
    opts: { cwd?: string },
    cb: (err: Error | null, result: { stdout: string }) => void
  ) => {
    calls.push({ args, cwd: opts?.cwd })
    const out = nextOutputs.shift()
    if (out instanceof Error) {
      cb(out, { stdout: '' })
    } else {
      cb(null, { stdout: out ?? '' })
    }
  }
}))

const setOutputs = (...outs: Array<string | Error>): void => {
  nextOutputs = outs
}

let mod: typeof import('./git-service')
let tmpRoot: string

beforeEach(async () => {
  calls.length = 0
  nextOutputs = []
  vi.resetModules()
  mod = await import('./git-service')
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-svc-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('isGitRepo', () => {
  it('returns true when rev-parse succeeds', async () => {
    setOutputs('true')
    expect(await mod.isGitRepo('/p')).toBe(true)
    expect(calls[0].args).toContain('--is-inside-work-tree')
  })

  it('returns false when rev-parse fails', async () => {
    setOutputs(new Error('not a git repo'))
    expect(await mod.isGitRepo('/p')).toBe(false)
  })
})

describe('getCommits', () => {
  it('parses log output into structured commits', async () => {
    const line = ['abc123', 'abc', 'fix bug', 'jo', '2h ago', 'HEAD -> main, origin/main', 'def456'].join(SEP)
    setOutputs(line)
    const commits = await mod.getCommits('/p', 10)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'abc123',
      shortHash: 'abc',
      message: 'fix bug',
      author: 'jo',
      date: '2h ago',
      refs: ['HEAD -> main', 'origin/main'],
      parents: ['def456']
    })
  })

  it('clamps maxCount into [1, 1000] and returns [] on error', async () => {
    setOutputs('')
    await mod.getCommits('/p', 99999)
    const maxArg = calls[0].args.find((a) => a.startsWith('--max-count='))
    expect(maxArg).toBe('--max-count=1000')

    nextOutputs = [new Error('boom')]
    expect(await mod.getCommits('/p')).toEqual([])
  })
})

describe('getBranches', () => {
  it('parses branch listing, marks current, and strips remotes/ prefix', async () => {
    setOutputs([
      '* main',
      '  feature/login',
      '  remotes/origin/HEAD -> origin/main',
      '  remotes/origin/main'
    ].join('\n'))
    const branches = await mod.getBranches('/p')
    expect(branches).toEqual([
      { name: 'main', current: true, remote: false },
      { name: 'feature/login', current: false, remote: false },
      { name: 'origin/main', current: false, remote: true }
    ])
  })

  it('returns [] on error', async () => {
    setOutputs(new Error('boom'))
    expect(await mod.getBranches('/p')).toEqual([])
  })
})

describe('getStatus', () => {
  it('parses porcelain output and propagates the highest-priority status to ancestor dirs', async () => {
    setOutputs([
      '?? new.ts',
      ' M src/a.ts',
      'AA src/conflict.ts'
    ].join('\n'))
    const status = await mod.getStatus('/p')
    expect(status['/p/new.ts']).toBe('untracked')
    expect(status['/p/src/a.ts']).toBe('modified')
    expect(status['/p/src/conflict.ts']).toBe('conflict')
    expect(status['/p/src']).toBe('conflict')
  })

  it('returns {} when raw output is empty or git fails', async () => {
    setOutputs('')
    expect(await mod.getStatus('/p')).toEqual({})

    nextOutputs = [new Error('boom')]
    expect(await mod.getStatus('/p')).toEqual({})
  })
})

describe('getFileAtHead', () => {
  it('uses git show with HEAD:relative-path', async () => {
    setOutputs('original-content')
    const result = await mod.getFileAtHead('/p', '/p/src/a.ts')
    expect(result).toBe('original-content')
    expect(calls[0].args).toEqual(['show', 'HEAD:src/a.ts'])
  })

  it('returns null for paths outside the repo', async () => {
    expect(await mod.getFileAtHead('/p', '/other/path/x.ts')).toBeNull()
  })

  it('returns null on error', async () => {
    setOutputs(new Error('boom'))
    expect(await mod.getFileAtHead('/p', '/p/x.ts')).toBeNull()
  })
})

describe('checkoutBranch', () => {
  it('checks out cleanly when there is nothing to stash', async () => {
    setOutputs('', '')
    const result = await mod.checkoutBranch('/p', 'feature')
    expect(result).toEqual({ success: true, branch: 'feature', stashed: false })
    expect(calls[0].args).toEqual(['status', '--porcelain'])
    expect(calls[1].args).toEqual(['checkout', 'feature'])
  })

  it('stashes dirty changes and pops afterwards', async () => {
    setOutputs(' M file', '', '', '')
    const result = await mod.checkoutBranch('/p', 'feature')
    expect(result).toEqual({ success: true, branch: 'feature', stashed: true })
    const argList = calls.map((c) => c.args[0]).join(',')
    expect(argList).toContain('stash')
  })

  it('returns failure with an error message when checkout fails', async () => {
    setOutputs('', new Error('cannot checkout'))
    const result = await mod.checkoutBranch('/p', 'broken')
    expect(result.success).toBe(false)
    expect(result.error).toBe('cannot checkout')
  })
})

describe('getDefaultBranch', () => {
  it('returns the symbolic-ref target of origin/HEAD', async () => {
    setOutputs('refs/remotes/origin/main')
    expect(await mod.getDefaultBranch('/p')).toBe('main')
  })

  it('falls back to "main" when origin/HEAD is missing but main exists', async () => {
    setOutputs(new Error('no symbolic-ref'), '')
    expect(await mod.getDefaultBranch('/p')).toBe('main')
  })

  it('falls back to "master" when neither exists', async () => {
    setOutputs(new Error('no symbolic-ref'), new Error('no main'))
    expect(await mod.getDefaultBranch('/p')).toBe('master')
  })
})

describe('getBranchDrift', () => {
  it('parses ahead/behind counts and computes diverged', async () => {
    setOutputs('feature', 'origin/feature', '3\t1')
    const drift = await mod.getBranchDrift('/p')
    expect(drift).toEqual({ ahead: 3, behind: 1, diverged: true, remoteBranch: 'origin/feature' })
  })

  it('returns zero drift when no upstream is configured', async () => {
    setOutputs('feature', new Error('no upstream'))
    expect(await mod.getBranchDrift('/p')).toEqual({ ahead: 0, behind: 0, diverged: false, remoteBranch: null })
  })
})

describe('getConflicts', () => {
  it('returns absolute paths for files in conflict', async () => {
    setOutputs([
      'UU a.ts',
      ' M b.ts',
      'AA c.ts',
      'DD d.ts'
    ].join('\n'))
    const conflicts = await mod.getConflicts('/p')
    expect(conflicts.map((c) => c.path).sort()).toEqual(['a.ts', 'c.ts', 'd.ts'])
    expect(conflicts[0].absolutePath).toBe(path.join('/p', conflicts[0].path))
  })
})

describe('getFirstChangedLine', () => {
  it('parses the first hunk header and returns the new-file line number', async () => {
    setOutputs('@@ -10,2 +12,3 @@')
    expect(await mod.getFirstChangedLine('/p', '/p/x.ts')).toBe(12)
  })

  it('returns 1 for untracked files when diff is empty but ls-files reports it', async () => {
    setOutputs('', 'src/new.ts')
    expect(await mod.getFirstChangedLine('/p', '/p/src/new.ts')).toBe(1)
  })

  it('returns null when nothing matches', async () => {
    setOutputs('', '')
    expect(await mod.getFirstChangedLine('/p', '/p/x.ts')).toBeNull()
  })

  it('returns null for paths outside the repo', async () => {
    expect(await mod.getFirstChangedLine('/p', '/other/x.ts')).toBeNull()
  })
})

describe('getCommitsSince', () => {
  it('parses stats commits with millisecond timestamps', async () => {
    const ts = 1_700_000_000
    setOutputs(`abc${SEP}${ts}${SEP}jo@x${SEP}Jo`)
    const commits = await mod.getCommitsSince('/p', null)
    expect(commits).toEqual([{
      hash: 'abc',
      timestamp: ts * 1000,
      authorEmail: 'jo@x',
      authorName: 'Jo'
    }])
  })

  it('passes --since when provided', async () => {
    setOutputs('')
    await mod.getCommitsSince('/p', '2025-01-01')
    expect(calls[0].args).toContain('--since=2025-01-01')
  })
})

describe('getLanguageTally', () => {
  it('counts files by language using EXT_TO_LANGUAGE', async () => {
    setOutputs([
      'src/a.ts',
      'src/b.ts',
      'src/c.tsx',
      'README.md',
      'no-extension',
      '.dotfile-ignored',
      'image.png'
    ].join('\n'))
    const tally = await mod.getLanguageTally('/p')
    expect(tally.TypeScript).toBe(3)
    expect(tally.Markdown).toBe(1)
  })

  it('returns {} when the listing is empty', async () => {
    setOutputs('')
    expect(await mod.getLanguageTally('/p')).toEqual({})
  })
})

describe('listGitignore / addToGitignore / removeFromGitignore', () => {
  it('listGitignore reads non-comment, non-empty lines', async () => {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'dist/\n# comment\n\nnode_modules\n')
    expect(await mod.listGitignore(tmpRoot)).toEqual(['dist/', 'node_modules'])
  })

  it('listGitignore returns [] when the file is missing', async () => {
    expect(await mod.listGitignore(tmpRoot)).toEqual([])
  })

  it('addToGitignore appends a new entry and untracks via git rm if tracked', async () => {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'existing\n')
    setOutputs('', '')
    const target = path.join(tmpRoot, 'secret.env')
    fs.writeFileSync(target, '')

    const result = await mod.addToGitignore(tmpRoot, target)

    expect(result.success).toBe(true)
    const after = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8')
    expect(after).toContain('existing')
    expect(after).toContain('secret.env')
    expect(calls.some((c) => c.args[0] === 'rm' && c.args.includes('secret.env'))).toBe(true)
  })

  it('addToGitignore does not duplicate an existing entry', async () => {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'secret.env\n')
    setOutputs(new Error('not tracked'))
    const target = path.join(tmpRoot, 'secret.env')

    const result = await mod.addToGitignore(tmpRoot, target)
    expect(result.success).toBe(true)
    const after = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8')
    expect(after.match(/secret\.env/g)?.length).toBe(1)
  })

  it('addToGitignore rejects paths outside the repo', async () => {
    const result = await mod.addToGitignore(tmpRoot, '/elsewhere/x.ts')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/outside the project/i)
  })

  it('removeFromGitignore drops the matching line and writes back', async () => {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'a\nb\nc\n')
    const result = await mod.removeFromGitignore(tmpRoot, 'b')
    expect(result.success).toBe(true)
    expect(fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8')).toBe('a\nc\n')
  })

  it('removeFromGitignore reports when the entry is missing', async () => {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'a\n')
    const result = await mod.removeFromGitignore(tmpRoot, 'missing')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('removeFromGitignore reports when .gitignore does not exist', async () => {
    const result = await mod.removeFromGitignore(tmpRoot, 'whatever')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/\.gitignore/i)
  })
})
