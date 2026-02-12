import { useBrowserStore } from '@/stores/browser-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { getTerminalInstance } from '@/components/terminal/TerminalInstance'
import { Trash2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsoleEntry } from '@/models/types'

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

const levelColors: Record<string, string> = {
  log: 'text-zinc-300',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400'
}

const EMPTY: ConsoleEntry[] = []

export function ConsolePanel(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeTabId = useBrowserStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : null
  )
  const activeTerminalTabId = useTerminalStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : null
  )
  const consoleEntries = useBrowserStore((s) => {
    if (!activeProjectId) return EMPTY
    const tabId = s.activeTabPerProject[activeProjectId]
    if (!tabId) return EMPTY
    return s.tabs.find((t) => t.id === tabId)?.consoleEntries ?? EMPTY
  })
  const { clearConsole } = useBrowserStore()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1">
        <span className="text-xs font-medium text-zinc-500">Console</span>
        <button
          onClick={() => activeTabId && clearConsole(activeTabId)}
          className="rounded p-1 text-zinc-600 hover:text-zinc-400"
          title="Clear"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {consoleEntries.length === 0 ? (
          <div className="p-3 text-zinc-600">No console messages</div>
        ) : (
          consoleEntries.map((entry, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start justify-between border-b border-zinc-900 px-3 py-1',
                levelColors[entry.level] || 'text-zinc-300'
              )}
            >
              <div className="min-w-0 flex-1">
                <span className="mr-2 text-zinc-600">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {entry.message}
              </div>
              {(entry.level === 'error' || entry.level === 'warn') && (
                <button
                  onClick={() =>
                    activeTerminalTabId &&
                    sendToTerminal(
                      activeTerminalTabId,
                      `I'm getting this console ${entry.level} in the browser: ${entry.message}`
                    )
                  }
                  disabled={!activeTerminalTabId}
                  className="ml-2 shrink-0 rounded p-1 text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:hover:text-zinc-600"
                  title="Send to LLM"
                >
                  <Send size={12} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
