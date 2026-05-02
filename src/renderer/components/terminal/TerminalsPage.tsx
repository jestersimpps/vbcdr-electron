import { useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react'
import { useTerminalStore } from '@/stores/terminal-store'
import {
  useTerminalsPageStore,
  GLOBAL_TERMINAL_OWNER,
  type LayoutNode,
  type SplitDirection
} from '@/stores/terminals-page-store'
import { TerminalInstance, disposeTerminal, focusTerminal } from '@/components/terminal/TerminalInstance'

function LeafView({
  leafId,
  tabId,
  onSplit,
  onClose
}: {
  leafId: string
  tabId: string
  onSplit: (leafId: string, direction: SplitDirection) => void
  onClose: (leafId: string) => void
}): React.ReactElement {
  const tab = useTerminalsPageStore((s) => s.tabs.find((t) => t.id === tabId))
  const focusedTabId = useTerminalStore((s) => s.focusedTabId)
  const isFocused = focusedTabId === tabId

  return (
    <div
      className="relative flex h-full flex-col"
      style={{
        boxShadow: isFocused ? 'inset 0 0 0 1px rgb(96 165 250)' : undefined,
        transition: 'box-shadow 120ms ease'
      }}
      onClick={() => focusTerminal(tabId)}
    >
      <div
        className={`flex items-center justify-between border-b px-2 py-0.5 ${
          isFocused ? 'border-blue-400/40 bg-blue-400/10' : 'border-zinc-800 bg-zinc-900/50'
        }`}
      >
        <span className={`truncate text-[10px] ${isFocused ? 'text-blue-300' : 'text-zinc-500'}`}>
          {tab?.title ?? 'Terminal'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSplit(leafId, 'horizontal')
            }}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="Split right"
          >
            <SplitSquareHorizontal size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSplit(leafId, 'vertical')
            }}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="Split down"
          >
            <SplitSquareVertical size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose(leafId)
            }}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
            title="Close terminal"
          >
            <X size={11} />
          </button>
        </div>
      </div>
      <div className="flex-1" style={{ minHeight: 0 }}>
        <TerminalInstance tabId={tabId} projectId={GLOBAL_TERMINAL_OWNER} cwd="" />
      </div>
    </div>
  )
}

function NodeView({
  node,
  onSplit,
  onClose
}: {
  node: LayoutNode
  onSplit: (leafId: string, direction: SplitDirection) => void
  onClose: (leafId: string) => void
}): React.ReactElement {
  if (node.type === 'leaf') {
    return <LeafView leafId={node.id} tabId={node.tabId} onSplit={onSplit} onClose={onClose} />
  }
  const dir = node.direction === 'horizontal' ? 'horizontal' : 'vertical'
  const handleClass =
    node.direction === 'horizontal'
      ? 'w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors'
      : 'h-1 bg-zinc-800 hover:bg-zinc-700 transition-colors'
  return (
    <PanelGroup direction={dir} autoSaveId={`terminals-page-${node.id}`}>
      <Panel defaultSize={50} minSize={10}>
        <NodeView node={node.a} onSplit={onSplit} onClose={onClose} />
      </Panel>
      <PanelResizeHandle className={handleClass} />
      <Panel defaultSize={50} minSize={10}>
        <NodeView node={node.b} onSplit={onSplit} onClose={onClose} />
      </Panel>
    </PanelGroup>
  )
}

export function TerminalsPage(): React.ReactElement {
  const tree = useTerminalsPageStore((s) => s.tree)
  const { ensureTree, splitLeaf, closeLeaf } = useTerminalsPageStore()
  const teardownInFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    ensureTree()
  }, [ensureTree])

  useEffect(() => {
    const unsubExit = window.api.terminal.onExit((tabId: string) => {
      const tabIds = useTerminalsPageStore.getState().collectTabIds()
      if (!tabIds.includes(tabId)) return
      if (teardownInFlight.current.has(tabId)) return
      teardownInFlight.current.add(tabId)
      const currentTree = useTerminalsPageStore.getState().tree
      const leafId = currentTree ? findLeafIdByTab(currentTree, tabId) : null
      if (leafId) {
        const result = useTerminalsPageStore.getState().closeLeaf(leafId)
        if (result) disposeTerminal(result.closedTabId)
      }
      teardownInFlight.current.delete(tabId)
    })
    return () => unsubExit()
  }, [])

  if (!tree) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Initializing terminals...
      </div>
    )
  }

  const handleSplit = (leafId: string, direction: SplitDirection): void => {
    splitLeaf(leafId, direction)
  }

  const handleClose = (leafId: string): void => {
    const result = closeLeaf(leafId)
    if (!result) return
    if (teardownInFlight.current.has(result.closedTabId)) return
    teardownInFlight.current.add(result.closedTabId)
    window.api.terminal.kill(result.closedTabId)
    disposeTerminal(result.closedTabId)
    teardownInFlight.current.delete(result.closedTabId)
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <NodeView node={tree} onSplit={handleSplit} onClose={handleClose} />
    </div>
  )
}

function findLeafIdByTab(node: LayoutNode, tabId: string): string | null {
  if (node.type === 'leaf') return node.tabId === tabId ? node.id : null
  return findLeafIdByTab(node.a, tabId) ?? findLeafIdByTab(node.b, tabId)
}
