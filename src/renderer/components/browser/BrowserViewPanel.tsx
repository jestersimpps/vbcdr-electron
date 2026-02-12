import { useEffect, useRef, useState, useCallback } from 'react'
import { useBrowserStore } from '@/stores/browser-store'
import { useProjectStore } from '@/stores/project-store'
import { usePasswordStore } from '@/stores/password-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { sendToTerminal } from '@/lib/send-to-terminal'
import { DeviceToolbar } from './DeviceToolbar'
import { PasswordSavePrompt } from './PasswordSavePrompt'
import { FindBar } from './FindBar'
import { getDetectionScript, getAutoFillScript } from '@/lib/password-injection'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Inspect,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Star,
  ChevronDown,
  Send
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsoleEntry, NetworkEntry, DeviceMode, HistoryEntry, Bookmark } from '@/models/types'

const DEVICE_DIMENSIONS: Record<DeviceMode, { width: number; height: number } | null> = {
  desktop: null,
  ipad: { width: 1024, height: 1366 },
  mobile: { width: 390, height: 844 }
}

function getDomain(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
  } catch {
    return url || 'New Tab'
  }
}

function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('localhost') || url.startsWith('127.0.0.1') || url.startsWith('0.0.0.0')) {
    return `http://${url}`
  }
  return `https://${url}`
}

const ZOOM_LEVELS = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3] as const
const ZOOM_PERCENTAGES: Record<number, number> = {
  [-3]: 25, [-2.5]: 33, [-2]: 40, [-1.5]: 50, [-1]: 63, [-0.5]: 80,
  [0]: 100, [0.5]: 125, [1]: 150, [1.5]: 175, [2]: 200, [2.5]: 250, [3]: 300
}

function SortableTab({
  tab,
  isActive,
  onSwitch,
  onClose
}: {
  tab: { id: string; url: string; title: string }
  isActive: boolean
  onSwitch: (id: string) => void
  onClose: (id: string) => void
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors select-none',
        isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
      )}
      onClick={() => onSwitch(tab.id)}
    >
      <span className="max-w-[150px] truncate">
        {tab.url ? getDomain(tab.url) : 'New Tab'}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
        className="hidden rounded p-0.5 hover:text-red-400 group-hover:block"
        title="Close tab"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function BrowserViewPanel(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabPerProject = useBrowserStore((s) => s.activeTabPerProject)
  const {
    createTab,
    closeTab,
    setActiveTab,
    setUrl,
    setTitle,
    setZoomLevel,
    reorderTabs,
    addConsoleEntry,
    addNetworkEntry,
    loadTabsForProject
  } = useBrowserStore()

  const activeTerminalTabId = useTerminalStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : null
  )

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId)
  const activeTabId = activeProjectId ? activeTabPerProject[activeProjectId] || null : null
  const activeTab = projectTabs.find((t) => t.id === activeTabId)

  const [inputUrl, setInputUrl] = useState(activeTab?.url || '')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [showFindBar, setShowFindBar] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 })
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showSendMenu, setShowSendMenu] = useState(false)
  const webviewRefs = useRef<Map<string, Electron.WebviewTag>>(new Map())
  const attachedTabs = useRef(new Set<string>())
  const findDebounce = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const isCurrentBookmarked = bookmarks.some((b) => b.url === activeTab?.url)

  useEffect(() => {
    const unsub = window.api.browser.onReload(() => {
      const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
      if (wv && activeTabId && attachedTabs.current.has(activeTabId)) {
        try { wv.reload() } catch {}
      }
    })
    return unsub
  }, [activeTabId])

  useEffect(() => {
    if (activeProjectId) loadTabsForProject(activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    setInputUrl(activeTab?.url || '')
  }, [activeTabId])

  useEffect(() => {
    const unsubNetwork = window.api.browser.onNetwork((tabId: string, entry: unknown) => {
      addNetworkEntry(tabId, entry as NetworkEntry)
    })
    return () => {
      unsubNetwork()
    }
  }, [])

  useEffect(() => {
    if (activeProjectId) {
      window.api.browser.getBookmarks(activeProjectId).then(setBookmarks).catch(() => {})
    }
  }, [activeProjectId])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setShowFindBar(true)
      }
    }
    const el = containerRef.current
    if (el) {
      el.addEventListener('keydown', handler)
      return () => el.removeEventListener('keydown', handler)
    }
  }, [])

  useEffect(() => {
    if (!showFindBar) {
      setFindQuery('')
      setMatchInfo({ current: 0, total: 0 })
      const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
      if (wv && activeTabId && attachedTabs.current.has(activeTabId)) {
        try { wv.stopFindInPage('clearSelection') } catch {}
      }
    }
  }, [showFindBar, activeTabId])

  const handleFindQueryChange = useCallback((query: string) => {
    setFindQuery(query)
    if (findDebounce.current) clearTimeout(findDebounce.current)
    findDebounce.current = setTimeout(() => {
      const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
      if (!wv || !activeTabId || !attachedTabs.current.has(activeTabId)) return
      if (!query) {
        try { wv.stopFindInPage('clearSelection') } catch {}
        setMatchInfo({ current: 0, total: 0 })
        return
      }
      wv.findInPage(query)
    }, 150)
  }, [activeTabId])

  const handleFindNext = useCallback(() => {
    const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
    if (wv && findQuery && activeTabId && attachedTabs.current.has(activeTabId)) {
      wv.findInPage(findQuery, { forward: true, findNext: true })
    }
  }, [activeTabId, findQuery])

  const handleFindPrev = useCallback(() => {
    const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
    if (wv && findQuery && activeTabId && attachedTabs.current.has(activeTabId)) {
      wv.findInPage(findQuery, { forward: false, findNext: true })
    }
  }, [activeTabId, findQuery])

  const injectPasswordScripts = useCallback(
    async (webview: Electron.WebviewTag, tabId: string): Promise<void> => {
      try {
        webview.executeJavaScript(getDetectionScript())
      } catch {}

      if (!activeProjectId) return
      try {
        const url = webview.getURL()
        const domain = getDomain(url)
        const creds = await usePasswordStore
          .getState()
          .getCredentialsForDomain(activeProjectId, domain)
        if (creds.length > 0) {
          const password = await usePasswordStore
            .getState()
            .decryptPassword(activeProjectId, creds[0].id)
          if (password) {
            webview.executeJavaScript(getAutoFillScript(creds[0].username, password))
          }
        }
      } catch {}
    },
    [activeProjectId]
  )

  const setupWebview = useCallback(
    (tabId: string, webview: Electron.WebviewTag) => {
      webviewRefs.current.set(tabId, webview)

      const fixShadowIframe = (): void => {
        const iframe = webview.shadowRoot?.querySelector('iframe')
        if (iframe) iframe.style.height = '100%'
      }
      fixShadowIframe()

      const onDomReady = (): void => {
        fixShadowIframe()
        const wcId = webview.getWebContentsId()
        if (!attachedTabs.current.has(tabId)) {
          attachedTabs.current.add(tabId)
          window.api.browser.attach(tabId, wcId)
        }
        injectPasswordScripts(webview, tabId)
      }

      const onStartLoading = (): void => {
        setIsLoading((prev) => ({ ...prev, [tabId]: true }))
      }

      const onStopLoading = (): void => {
        setIsLoading((prev) => ({ ...prev, [tabId]: false }))
      }

      const onFoundInPage = (e: Electron.FoundInPageEvent): void => {
        if (e.result) {
          setMatchInfo({ current: e.result.activeMatchOrdinal, total: e.result.matches })
        }
      }

      const onConsoleMessage = (e: Electron.ConsoleMessageEvent): void => {
        if (e.message.startsWith('__VC_PWD__:')) {
          try {
            const data = JSON.parse(e.message.slice('__VC_PWD__:'.length))
            if (data.type === 'form-submit' && data.password) {
              usePasswordStore.getState().setPendingPrompt({
                tabId,
                domain: data.domain,
                username: data.username || '',
                password: data.password
              })
            }
          } catch {}
          return
        }

        const levelMap: Record<number, ConsoleEntry['level']> = {
          0: 'log',
          1: 'warn',
          2: 'error',
          3: 'info'
        }
        addConsoleEntry(tabId, {
          level: levelMap[e.level] || 'log',
          message: e.message,
          timestamp: Date.now()
        })
      }

      const onDidNavigate = (e: Electron.DidNavigateEvent): void => {
        setUrl(tabId, e.url)
        if (tabId === activeTabId) {
          setInputUrl(e.url)
          setCanGoBack(webview.canGoBack())
          setCanGoForward(webview.canGoForward())
        }
        try {
          const title = webview.getTitle()
          if (title) setTitle(tabId, title)
          if (activeProjectId && e.url) {
            window.api.browser.addHistory(activeProjectId, e.url, title || getDomain(e.url)).catch(() => {})
          }
        } catch {}
        injectPasswordScripts(webview, tabId)
      }

      const onDidNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
        if (e.isMainFrame) {
          setUrl(tabId, e.url)
          if (tabId === activeTabId) {
            setInputUrl(e.url)
            setCanGoBack(webview.canGoBack())
            setCanGoForward(webview.canGoForward())
          }
        }
      }

      webview.addEventListener('dom-ready', onDomReady)
      webview.addEventListener('did-start-loading', onStartLoading)
      webview.addEventListener('did-stop-loading', onStopLoading)
      webview.addEventListener('found-in-page', onFoundInPage as EventListener)
      webview.addEventListener('console-message', onConsoleMessage as EventListener)
      webview.addEventListener('did-navigate', onDidNavigate as EventListener)
      webview.addEventListener('did-navigate-in-page', onDidNavigateInPage as EventListener)

      return () => {
        webview.removeEventListener('dom-ready', onDomReady)
        webview.removeEventListener('did-start-loading', onStartLoading)
        webview.removeEventListener('did-stop-loading', onStopLoading)
        webview.removeEventListener('found-in-page', onFoundInPage as EventListener)
        webview.removeEventListener('console-message', onConsoleMessage as EventListener)
        webview.removeEventListener('did-navigate', onDidNavigate as EventListener)
        webview.removeEventListener('did-navigate-in-page', onDidNavigateInPage as EventListener)
      }
    },
    [activeTabId, activeProjectId, addConsoleEntry, setUrl, setTitle, injectPasswordScripts]
  )

  const handleNavigate = (url?: string): void => {
    const target = url || inputUrl.trim()
    if (!target || !activeTabId) return
    const normalized = normalizeUrl(target)
    setUrl(activeTabId, normalized)
    setInputUrl(normalized)
    setShowHistory(false)
    const webview = webviewRefs.current.get(activeTabId)
    if (webview && attachedTabs.current.has(activeTabId)) {
      webview.loadURL(normalized)
    }
  }

  const handleNewTab = (): void => {
    if (!activeProjectId) return
    createTab(activeProjectId)
  }

  const handleCloseTab = (tabId: string): void => {
    if (!activeProjectId) return
    if (attachedTabs.current.has(tabId)) {
      window.api.browser.detach(tabId)
      attachedTabs.current.delete(tabId)
    }
    webviewRefs.current.delete(tabId)
    closeTab(activeProjectId, tabId)
  }

  const handleSwitchTab = (tabId: string): void => {
    if (!activeProjectId) return
    setActiveTab(activeProjectId, tabId)
    const webview = webviewRefs.current.get(tabId)
    if (webview && attachedTabs.current.has(tabId)) {
      try {
        setCanGoBack(webview.canGoBack())
        setCanGoForward(webview.canGoForward())
      } catch {
        setCanGoBack(false)
        setCanGoForward(false)
      }
    }
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    if (!activeProjectId) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = projectTabs.findIndex((t) => t.id === active.id)
    const toIndex = projectTabs.findIndex((t) => t.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTabs(activeProjectId, fromIndex, toIndex)
    }
  }

  const handleZoomIn = (): void => {
    if (!activeTab) return
    const currentIdx = ZOOM_LEVELS.indexOf(activeTab.zoomLevel as typeof ZOOM_LEVELS[number])
    const nextIdx = Math.min((currentIdx === -1 ? 6 : currentIdx) + 1, ZOOM_LEVELS.length - 1)
    setZoomLevel(activeTab.id, ZOOM_LEVELS[nextIdx])
  }

  const handleZoomOut = (): void => {
    if (!activeTab) return
    const currentIdx = ZOOM_LEVELS.indexOf(activeTab.zoomLevel as typeof ZOOM_LEVELS[number])
    const nextIdx = Math.max((currentIdx === -1 ? 6 : currentIdx) - 1, 0)
    setZoomLevel(activeTab.id, ZOOM_LEVELS[nextIdx])
  }

  const handleZoomReset = (): void => {
    if (!activeTab) return
    setZoomLevel(activeTab.id, 0)
  }

  const handleUrlInputChange = (value: string): void => {
    setInputUrl(value)
    if (!activeProjectId) return
    if (value.length >= 1) {
      window.api.browser.getHistory(activeProjectId).then((entries: HistoryEntry[]) => {
        const q = value.toLowerCase()
        const filtered = entries
          .filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
          .sort((a, b) => b.visitCount * (b.lastVisited / 1e12) - a.visitCount * (a.lastVisited / 1e12))
          .slice(0, 10)
        setHistoryEntries(filtered)
        setShowHistory(filtered.length > 0)
      }).catch(() => {})
    } else {
      setShowHistory(false)
    }
  }

  const handleToggleBookmark = async (): Promise<void> => {
    if (!activeProjectId || !activeTab?.url) return
    const existing = bookmarks.find((b) => b.url === activeTab.url)
    if (existing) {
      await window.api.browser.removeBookmark(activeProjectId, existing.id)
    } else {
      await window.api.browser.addBookmark(activeProjectId, activeTab.url, activeTab.title || getDomain(activeTab.url))
    }
    const updated = await window.api.browser.getBookmarks(activeProjectId)
    setBookmarks(updated)
  }

  const handleSendHtml = async (): Promise<void> => {
    if (!activeTabId || !activeTerminalTabId) return
    setShowSendMenu(false)
    try {
      const html = await window.api.browser.captureHtml(activeTabId)
      const truncated = html.length > 50000 ? html.slice(0, 50000) + '\n... (truncated)' : html
      sendToTerminal(activeTerminalTabId, `Here is the HTML of the page I'm looking at:\n\`\`\`html\n${truncated}\n\`\`\``)
    } catch {}
  }

  const handleSendScreenshot = async (): Promise<void> => {
    if (!activeTabId || !activeTerminalTabId) return
    setShowSendMenu(false)
    try {
      const filePath = await window.api.browser.captureScreenshot(activeTabId)
      if (filePath) {
        await window.api.terminal.pasteImage(activeTerminalTabId, filePath)
      }
    } catch {}
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col" tabIndex={-1}>
      <div className="relative z-20 flex items-center border-b border-zinc-800 bg-zinc-900">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projectTabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-1 items-center gap-1 overflow-x-auto px-1.5 py-1">
              {projectTabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTabId === tab.id}
                  onSwitch={handleSwitchTab}
                  onClose={handleCloseTab}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          onClick={handleNewTab}
          disabled={!activeProjectId}
          className="mr-1 rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="New tab"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="relative z-20 flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-2 py-1.5">
        <button
          onClick={() => {
            const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
            if (wv && activeTabId && attachedTabs.current.has(activeTabId)) {
              try { wv.goBack() } catch {}
            }
          }}
          disabled={!canGoBack}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={() => {
            const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
            if (wv && activeTabId && attachedTabs.current.has(activeTabId)) {
              try { wv.goForward() } catch {}
            }
          }}
          disabled={!canGoForward}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="Forward"
        >
          <ArrowRight size={14} />
        </button>
        <button
          onClick={() => {
            const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
            if (wv && activeTabId && attachedTabs.current.has(activeTabId)) {
              try { wv.reload() } catch {}
            }
          }}
          disabled={!activeTabId}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="Reload"
        >
          <RotateCw size={14} />
        </button>

        <button
          onClick={() => {
            const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
            if (wv && activeTabId && attachedTabs.current.has(activeTabId)) {
              try { window.api.browser.openDevTools(wv.getWebContentsId()) } catch {}
            }
          }}
          disabled={!activeTabId || !activeTab?.url}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="Open DevTools"
        >
          <Inspect size={14} />
        </button>

        <div className="relative flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleNavigate()
            }}
          >
            <input
              ref={urlInputRef}
              type="text"
              value={inputUrl}
              onChange={(e) => handleUrlInputChange(e.target.value)}
              onFocus={() => {
                if (inputUrl && activeProjectId) handleUrlInputChange(inputUrl)
              }}
              onBlur={() => setTimeout(() => setShowHistory(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowHistory(false)
              }}
              placeholder="Enter URL..."
              disabled={!activeTabId}
              className="w-full rounded-md bg-zinc-800 px-3 py-1 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
            />
          </form>

          {showHistory && historyEntries.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {historyEntries.map((entry, i) => (
                <button
                  key={i}
                  className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-zinc-800"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleNavigate(entry.url)
                  }}
                >
                  <span className="truncate text-xs text-zinc-300">{entry.url}</span>
                  <span className="truncate text-[10px] text-zinc-500">{entry.title}</span>
                </button>
              ))}
              <button
                className="w-full px-3 py-1 text-left text-[10px] text-zinc-600 hover:text-zinc-400"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (activeProjectId) {
                    window.api.browser.clearHistory(activeProjectId).then(() => {
                      setHistoryEntries([])
                      setShowHistory(false)
                    }).catch(() => {})
                  }
                }}
              >
                Clear history
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleToggleBookmark}
          disabled={!activeTab?.url}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title={isCurrentBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <Star size={14} className={isCurrentBookmarked ? 'fill-yellow-400 text-yellow-400' : ''} />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            disabled={bookmarks.length === 0}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
            title="Bookmarks"
          >
            <ChevronDown size={12} />
          </button>
          {showBookmarks && bookmarks.length > 0 && (
            <div className="absolute right-0 top-full z-50 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {bookmarks.map((bm) => (
                <div key={bm.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800">
                  <button
                    className="flex min-w-0 flex-1 flex-col text-left"
                    onClick={() => {
                      handleNavigate(bm.url)
                      setShowBookmarks(false)
                    }}
                  >
                    <span className="truncate text-xs text-zinc-300">{bm.title}</span>
                    <span className="truncate text-[10px] text-zinc-500">{bm.url}</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!activeProjectId) return
                      await window.api.browser.removeBookmark(activeProjectId, bm.id)
                      const updated = await window.api.browser.getBookmarks(activeProjectId)
                      setBookmarks(updated)
                    }}
                    className="shrink-0 rounded p-1 text-zinc-600 hover:text-red-400"
                    title="Delete"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 border-l border-zinc-700 pl-2">
          <button onClick={handleZoomOut} disabled={!activeTab || activeTab.zoomLevel <= -3}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button onClick={handleZoomReset} disabled={!activeTab || activeTab.zoomLevel === 0}
            className="min-w-[36px] rounded px-1 py-0.5 text-center text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50" title="Reset zoom">
            {ZOOM_PERCENTAGES[activeTab?.zoomLevel ?? 0] ?? 100}%
          </button>
          <button onClick={handleZoomIn} disabled={!activeTab || activeTab.zoomLevel >= 3}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30" title="Zoom in">
            <ZoomIn size={14} />
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSendMenu(!showSendMenu)}
            disabled={!activeTabId || !activeTab?.url || !activeTerminalTabId}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
            title="Send to LLM"
          >
            <Send size={14} />
          </button>
          {showSendMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              <button
                onClick={handleSendHtml}
                className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Send HTML to LLM
              </button>
              <button
                onClick={handleSendScreenshot}
                className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Send Screenshot to LLM
              </button>
            </div>
          )}
        </div>

        <DeviceToolbar />
      </div>

      <PasswordSavePrompt />

      <div className="relative flex-1 overflow-hidden bg-zinc-950">
        {activeTabId && isLoading[activeTabId] && (
          <div className="absolute left-0 right-0 top-0 z-20 h-0.5 overflow-hidden bg-zinc-800">
            <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] bg-blue-500" />
          </div>
        )}

        {showFindBar && (
          <FindBar
            query={findQuery}
            onQueryChange={handleFindQueryChange}
            matchInfo={matchInfo}
            onNext={handleFindNext}
            onPrev={handleFindPrev}
            onClose={() => setShowFindBar(false)}
          />
        )}

        {!activeTab ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            {activeProjectId ? 'Click + to open a browser tab' : 'Select a project first'}
          </div>
        ) : !activeTab.url ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            Enter a URL to preview
          </div>
        ) : null}

        {projectTabs
          .filter((tab) => tab.url)
          .map((tab) => (
            <WebviewTab
              key={tab.id}
              tabId={tab.id}
              url={tab.url}
              projectId={tab.projectId}
              isActive={tab.id === activeTabId}
              deviceMode={tab.deviceMode}
              zoomLevel={tab.zoomLevel}
              onSetup={setupWebview}
            />
          ))}
      </div>
    </div>
  )
}

interface WebviewTabProps {
  tabId: string
  url: string
  projectId: string
  isActive: boolean
  deviceMode: DeviceMode
  zoomLevel: number
  onSetup: (tabId: string, webview: Electron.WebviewTag) => () => void
}

function WebviewTab({ tabId, url, projectId, isActive, deviceMode, zoomLevel, onSetup }: WebviewTabProps): React.ReactElement {
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initialUrl = useRef(url)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    return onSetup(tabId, webview)
  }, [tabId])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    try { webview.setZoomLevel(zoomLevel) } catch {}
  }, [zoomLevel])

  const dims = DEVICE_DIMENSIONS[deviceMode]

  useEffect(() => {
    if (!dims || !containerRef.current) {
      setScale(1)
      return
    }
    const container = containerRef.current
    const updateScale = (): void => {
      const rect = container.getBoundingClientRect()
      const padding = 32
      const scaleX = (rect.width - padding) / dims.width
      const scaleY = (rect.height - padding) / dims.height
      setScale(Math.min(scaleX, scaleY, 1))
    }
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    updateScale()
    return () => observer.disconnect()
  }, [deviceMode, dims])

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute inset-0',
        isActive ? 'z-10' : 'z-0 hidden',
        dims && 'flex items-center justify-center bg-zinc-950'
      )}
    >
      {dims ? (
        <div style={{ width: dims.width * scale, height: dims.height * scale, overflow: 'hidden', borderRadius: 8 }}>
          <webview
            ref={webviewRef}
            src={initialUrl.current}
            style={{
              width: dims.width,
              height: dims.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left'
            }}
            className="rounded-lg border border-zinc-700 shadow-2xl"
            // @ts-expect-error webview attributes not in React types
            allowpopups="true"
            partition={`persist:project-${projectId}`}
          />
        </div>
      ) : (
        <webview
          ref={webviewRef}
          src={initialUrl.current}
          className="h-full w-full"
          // @ts-expect-error webview attributes not in React types
          allowpopups="true"
          partition={`persist:project-${projectId}`}
        />
      )}
    </div>
  )
}
