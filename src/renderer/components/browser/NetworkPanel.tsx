import { useState } from 'react'
import { useBrowserStore } from '@/stores/browser-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { getTerminalInstance } from '@/components/terminal/TerminalInstance'
import { Trash2, ChevronDown, ChevronRight, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NetworkEntry } from '@/models/types'

function sendToTerminal(tabId: string, text: string): void {
  const entry = getTerminalInstance(tabId)
  if (!entry) return
  entry.terminal.paste(text)
  setTimeout(() => {
    const textarea = entry.terminal.textarea
    if (!textarea) return
    textarea.focus()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
  }, 500)
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-400'
  if (status >= 300 && status < 400) return 'text-yellow-400'
  if (status >= 400) return 'text-red-400'
  return 'text-zinc-400'
}

function HeadersTable({ headers }: { headers: Record<string, string> }): React.ReactElement {
  const entries = Object.entries(headers)
  if (entries.length === 0) return <span className="text-zinc-600">None</span>
  return (
    <div className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <span className="text-zinc-400 select-text">{key}</span>
          <span className="text-zinc-300 break-all select-text">{value}</span>
        </div>
      ))}
    </div>
  )
}

function NetworkDetail({ entry }: { entry: NetworkEntry }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'general' | 'request' | 'response'>('general')

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'request', label: 'Request Headers' },
    { key: 'response', label: 'Response Headers' }
  ]

  return (
    <div className="border-b border-zinc-800 bg-zinc-950">
      <div className="flex gap-0 border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-1 text-xs',
              activeTab === tab.key
                ? 'text-zinc-200 border-b-2 border-zinc-400'
                : 'text-zinc-500 hover:text-zinc-400'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-3 text-xs max-h-64 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-1">
            <span className="text-zinc-500">Request URL</span>
            <span className="text-zinc-300 break-all select-text">{entry.url}</span>
            <span className="text-zinc-500">Request Method</span>
            <span className="text-zinc-300 select-text">{entry.method}</span>
            <span className="text-zinc-500">Status Code</span>
            <span className={cn(statusColor(entry.status), 'select-text')}>
              {entry.status} {entry.statusText}
            </span>
            <span className="text-zinc-500">Type</span>
            <span className="text-zinc-300 select-text">{entry.type}</span>
            <span className="text-zinc-500">MIME Type</span>
            <span className="text-zinc-300 select-text">{entry.mimeType || '-'}</span>
            <span className="text-zinc-500">Protocol</span>
            <span className="text-zinc-300 select-text">{entry.protocol || '-'}</span>
            <span className="text-zinc-500">Remote Address</span>
            <span className="text-zinc-300 select-text">{entry.remoteAddress || '-'}</span>
            <span className="text-zinc-500">Size</span>
            <span className="text-zinc-300 select-text">{formatSize(entry.size)}</span>
            <span className="text-zinc-500">Duration</span>
            <span className="text-zinc-300 select-text">{entry.duration.toFixed(0)}ms</span>
            {entry.postData && (
              <>
                <span className="text-zinc-500">Request Body</span>
                <pre className="text-zinc-300 whitespace-pre-wrap break-all select-text font-mono">
                  {entry.postData}
                </pre>
              </>
            )}
          </div>
        )}
        {activeTab === 'request' && <HeadersTable headers={entry.requestHeaders} />}
        {activeTab === 'response' && <HeadersTable headers={entry.responseHeaders} />}
      </div>
    </div>
  )
}

const EMPTY: NetworkEntry[] = []

const TYPE_FILTERS = ['All', 'XHR', 'Fetch', 'Doc', 'JS', 'CSS', 'Img', 'Font', 'Media', 'WS', 'Other'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

const TYPE_FILTER_MAP: Record<Exclude<TypeFilter, 'All'>, (e: NetworkEntry) => boolean> = {
  XHR: (e) => e.type === 'XHR',
  Fetch: (e) => e.type === 'Fetch',
  Doc: (e) => e.type === 'Document',
  JS: (e) => e.type === 'Script',
  CSS: (e) => e.type === 'Stylesheet',
  Img: (e) => e.type === 'Image',
  Font: (e) => e.type === 'Font',
  Media: (e) => e.type === 'Media',
  WS: (e) => e.type === 'WebSocket',
  Other: (e) => !['XHR', 'Fetch', 'Document', 'Script', 'Stylesheet', 'Image', 'Font', 'Media', 'WebSocket'].includes(e.type)
}

export function NetworkPanel(): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<TypeFilter>('All')
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeTabId = useBrowserStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : null
  )
  const activeTerminalTabId = useTerminalStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : null
  )
  const networkEntries = useBrowserStore((s) => {
    if (!activeProjectId) return EMPTY
    const tabId = s.activeTabPerProject[activeProjectId]
    if (!tabId) return EMPTY
    return s.tabs.find((t) => t.id === tabId)?.networkEntries ?? EMPTY
  })
  const { clearNetwork } = useBrowserStore()

  const filteredEntries = activeFilter === 'All'
    ? networkEntries
    : networkEntries.filter(TYPE_FILTER_MAP[activeFilter])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1">
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                'px-1.5 py-0.5 text-[10px] rounded whitespace-nowrap',
                activeFilter === filter
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            activeTabId && clearNetwork(activeTabId)
            setExpandedId(null)
          }}
          className="rounded p-1 text-zinc-600 hover:text-zinc-400 shrink-0"
          title="Clear"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="grid grid-cols-[16px_60px_60px_1fr_70px_60px_60px_24px] gap-x-2 border-b border-zinc-800 px-3 py-1 text-xs font-medium text-zinc-500">
        <span />
        <span>Method</span>
        <span>Status</span>
        <span>URL</span>
        <span>Type</span>
        <span>Size</span>
        <span>Time</span>
        <span />
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {filteredEntries.length === 0 ? (
          <div className="p-3 text-zinc-600">
            {networkEntries.length === 0 ? 'No network requests' : 'No matching requests'}
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isExpanded = expandedId === entry.id
            return (
              <div key={entry.id}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className={cn(
                    'grid grid-cols-[16px_60px_60px_1fr_70px_60px_60px_24px] gap-x-2 border-b border-zinc-900 px-3 py-1 cursor-pointer hover:bg-zinc-800/50',
                    isExpanded && 'bg-zinc-800/50'
                  )}
                >
                  <span className="text-zinc-600 flex items-center">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <span className="text-zinc-400">{entry.method}</span>
                  <span className={cn(statusColor(entry.status))}>{entry.status}</span>
                  <span className="truncate text-zinc-300" title={entry.url}>
                    {entry.url}
                  </span>
                  <span className="truncate text-zinc-500">{entry.type}</span>
                  <span className="text-zinc-500">{formatSize(entry.size)}</span>
                  <span className="text-zinc-500">{entry.duration.toFixed(0)}ms</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!activeTerminalTabId) return
                      let msg = `I'm getting a ${entry.status} ${entry.statusText} on ${entry.method} ${entry.url}`
                      if (entry.postData) msg += `\nRequest body: ${entry.postData}`
                      sendToTerminal(activeTerminalTabId, msg)
                    }}
                    disabled={!activeTerminalTabId}
                    className="flex items-center rounded p-1 text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:hover:text-zinc-600"
                    title="Send to LLM"
                  >
                    <Send size={12} />
                  </button>
                </div>
                {isExpanded && <NetworkDetail entry={entry} />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
