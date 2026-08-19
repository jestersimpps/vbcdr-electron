import { describe, it, expect } from 'vitest'
import { flattenTree } from './flatten-tree'
import type { FileNode } from '@/models/types'

function dir(name: string, path: string, children: FileNode[]): FileNode {
  return { name, path, isDirectory: true, children } as FileNode
}

function file(name: string, path: string): FileNode {
  return { name, path, isDirectory: false } as FileNode
}

describe('flattenTree', () => {
  it('returns an empty list for an undefined tree', () => {
    expect(flattenTree(undefined)).toEqual([])
  })

  it('excludes directories and keeps only files', () => {
    const tree = dir('src', '/src', [file('App.tsx', '/src/App.tsx')])
    expect(flattenTree(tree)).toEqual([{ path: '/src/App.tsx', name: 'App.tsx' }])
  })

  it('recurses through nested directories in depth-first order', () => {
    const tree = dir('src', '/src', [
      file('App.tsx', '/src/App.tsx'),
      dir('lib', '/src/lib', [
        file('fuzzy.ts', '/src/lib/fuzzy.ts'),
        dir('voice', '/src/lib/voice', [file('vad.ts', '/src/lib/voice/vad.ts')])
      ]),
      file('index.ts', '/src/index.ts')
    ])

    expect(flattenTree(tree).map((f) => f.path)).toEqual([
      '/src/App.tsx',
      '/src/lib/fuzzy.ts',
      '/src/lib/voice/vad.ts',
      '/src/index.ts'
    ])
  })

  it('handles a directory with no children array', () => {
    expect(flattenTree(dir('empty', '/empty', undefined as unknown as FileNode[]))).toEqual([])
  })

  it('handles a bare file as the root', () => {
    expect(flattenTree(file('README.md', '/README.md'))).toEqual([
      { path: '/README.md', name: 'README.md' }
    ])
  })
})
