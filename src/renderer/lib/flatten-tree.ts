import type { FileNode } from '@/models/types'

export interface FlatFile {
  path: string
  name: string
}

export function flattenTree(node: FileNode | undefined, out: FlatFile[] = []): FlatFile[] {
  if (!node) return out
  if (!node.isDirectory) out.push({ path: node.path, name: node.name })
  if (node.children) {
    for (const child of node.children) flattenTree(child, out)
  }
  return out
}
