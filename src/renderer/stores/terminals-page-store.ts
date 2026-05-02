import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'

export type SplitDirection = 'horizontal' | 'vertical'

export const GLOBAL_TERMINAL_OWNER = '__global__'

export interface GlobalTab {
  id: string
  title: string
}

export interface LeafNode {
  type: 'leaf'
  id: string
  tabId: string
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: SplitDirection
  a: LayoutNode
  b: LayoutNode
}

export type LayoutNode = LeafNode | SplitNode

interface TerminalsPageStore {
  tree: LayoutNode | null
  tabs: GlobalTab[]
  ensureTree: () => void
  splitLeaf: (leafId: string, direction: SplitDirection) => string | null
  closeLeaf: (leafId: string) => { closedTabId: string; replacementTabId?: string } | null
  collectTabIds: () => string[]
}

function findLeaf(node: LayoutNode, leafId: string): LeafNode | null {
  if (node.type === 'leaf') return node.id === leafId ? node : null
  return findLeaf(node.a, leafId) ?? findLeaf(node.b, leafId)
}

function replaceNode(node: LayoutNode, targetId: string, replacement: LayoutNode): LayoutNode {
  if (node.id === targetId) return replacement
  if (node.type === 'split') {
    const a = replaceNode(node.a, targetId, replacement)
    const b = replaceNode(node.b, targetId, replacement)
    if (a === node.a && b === node.b) return node
    return { ...node, a, b }
  }
  return node
}

function removeLeaf(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.id === leafId ? null : node
  }
  if (node.a.type === 'leaf' && node.a.id === leafId) return node.b
  if (node.b.type === 'leaf' && node.b.id === leafId) return node.a
  const a = removeLeaf(node.a, leafId)
  const b = removeLeaf(node.b, leafId)
  if (a === node.a && b === node.b) return node
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

function collect(node: LayoutNode, out: string[]): void {
  if (node.type === 'leaf') {
    out.push(node.tabId)
    return
  }
  collect(node.a, out)
  collect(node.b, out)
}

function makeLeaf(tabId: string): LeafNode {
  return { type: 'leaf', id: uuid(), tabId }
}

function makeTab(existing: GlobalTab[]): GlobalTab {
  return { id: uuid(), title: `Terminal ${existing.length + 1}` }
}

export const useTerminalsPageStore = create<TerminalsPageStore>()(
  persist(
    (set, get) => ({
      tree: null,
      tabs: [],

      ensureTree: () => {
        if (get().tree) return
        const tab = makeTab(get().tabs)
        set({ tree: makeLeaf(tab.id), tabs: [...get().tabs, tab] })
      },

      splitLeaf: (leafId, direction) => {
        const tree = get().tree
        if (!tree) return null
        const leaf = findLeaf(tree, leafId)
        if (!leaf) return null
        const tab = makeTab(get().tabs)
        const newLeaf = makeLeaf(tab.id)
        const split: SplitNode = {
          type: 'split',
          id: uuid(),
          direction,
          a: leaf,
          b: newLeaf
        }
        set({
          tree: replaceNode(tree, leafId, split),
          tabs: [...get().tabs, tab]
        })
        return tab.id
      },

      closeLeaf: (leafId) => {
        const tree = get().tree
        if (!tree) return null
        const leaf = findLeaf(tree, leafId)
        if (!leaf) return null
        const closedTabId = leaf.tabId
        const remainingTabs = get().tabs.filter((t) => t.id !== closedTabId)
        const next = removeLeaf(tree, leafId)
        if (next === null) {
          const tab = makeTab(remainingTabs)
          set({ tree: makeLeaf(tab.id), tabs: [...remainingTabs, tab] })
          return { closedTabId, replacementTabId: tab.id }
        }
        set({ tree: next, tabs: remainingTabs })
        return { closedTabId }
      },

      collectTabIds: () => {
        const tree = get().tree
        if (!tree) return []
        const out: string[] = []
        collect(tree, out)
        return out
      }
    }),
    {
      name: 'vbcdr-terminals-page',
      partialize: (state) => ({ tree: state.tree, tabs: state.tabs })
    }
  )
)
