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

export function BrowserViewPanel(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabPerProject = useBrowserStore((s) => s.activeTabPerProject)
  const {
    createTab,
    closeTab,
    setActiveTab,
    setUrl,
    addConsoleEntry,
    addNetworkEntry,
    loadTabsForProject
  } = useBrowserStore()

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId)
  const activeTabId = activeProjectId ? activeTabPerProject[activeProjectId] || null : null
  const activeTab = projectTabs.find((t) => t.id === activeTabId)

  const [inputUrl, setInputUrl] = useState(activeTab?.url || '')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRefs = useRef<Map<string, Electron.WebviewTag>>(new Map())
  const attachedTabs = useRef(new Set<string>())

  useEffect(() => {
    const unsub = window.api.browser.onReload(() => {
      const wv = activeTabId ? webviewRefs.current.get(activeTabId) : null
      if (wv && activeTabId && attachedTabs.current.has(activeTabId)) wv.reload()
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
      webview.addEventListener('console-message', onConsoleMessage as EventListener)
      webview.addEventListener('did-navigate', onDidNavigate as EventListener)
      webview.addEventListener('did-navigate-in-page', onDidNavigateInPage as EventListener)

      return () => {
        webview.removeEventListener('dom-ready', onDomReady)
        webview.removeEventListener('console-message', onConsoleMessage as EventListener)
        webview.removeEventListener('did-navigate', onDidNavigate as EventListener)
        webview.removeEventListener('did-navigate-in-page', onDidNavigateInPage as EventListener)
      }
    },
    [activeTabId, addConsoleEntry, setUrl, injectPasswordScripts]
  )

  const handleNavigate = (): void => {
    if (!inputUrl.trim() || !activeTabId) return
    const url = normalizeUrl(inputUrl.trim())
    setUrl(activeTabId, url)
    setInputUrl(url)
    const webview = webviewRefs.current.get(activeTabId)
    if (webview && attachedTabs.current.has(activeTabId)) {
      webview.loadURL(url)
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

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-20 flex items-center border-b border-zinc-800 bg-zinc-900">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto px-1.5 py-1">
          {projectTabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                activeTabId === tab.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
              )}
              onClick={() => handleSwitchTab(tab.id)}
            >
              <span className="max-w-[150px] truncate">
                {tab.url ? getDomain(tab.url) : 'New Tab'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseTab(tab.id)
                }}
                className="hidden rounded p-0.5 hover:text-red-400 group-hover:block"
                title="Close tab"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
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
              wv.goBack()
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
              wv.goForward()
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
              wv.reload()
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
              window.api.browser.openDevTools(wv.getWebContentsId())
            }
          }}
          disabled={!activeTabId || !activeTab?.url}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
          title="Open DevTools"
        >
          <Inspect size={14} />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleNavigate()
          }}
          className="flex-1"
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL..."
            disabled={!activeTabId}
            className="w-full rounded-md bg-zinc-800 px-3 py-1 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
          />
        </form>

        <DeviceToolbar />
      </div>

      <PasswordSavePrompt />

      <div className="relative flex-1 overflow-hidden bg-zinc-950">
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
  onSetup: (tabId: string, webview: Electron.WebviewTag) => () => void
}

function WebviewTab({ tabId, url, projectId, isActive, deviceMode, onSetup }: WebviewTabProps): React.ReactElement {
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initialUrl = useRef(url)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    return onSetup(tabId, webview)
  }, [tabId])

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
