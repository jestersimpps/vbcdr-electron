import { useEffect, useRef, useState, useCallback } from 'react'
import { useBrowserStore } from '@/stores/browser-store'
import { useProjectStore } from '@/stores/project-store'
import { usePasswordStore } from '@/stores/password-store'
import { DeviceToolbar } from './DeviceToolbar'
import { PasswordSavePrompt } from './PasswordSavePrompt'
import { getDetectionScript, getAutoFillScript } from '@/lib/password-injection'
import { ArrowLeft, ArrowRight, RotateCw, Plus, X, Inspect } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsoleEntry, NetworkEntry, DeviceMode } from '@/models/types'

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
      if (wv) wv.reload()
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
    if (webview) {
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
    if (webview) {
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
            if (wv) {
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
            if (wv) {
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
            if (wv) {
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
            if (wv) {
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

const FRAME = {
  mobile: { bezel: 10, radius: 68, statusBar: 54, homeBar: 28 },
  ipad: { bezel: 12, radius: 36, statusBar: 0, homeBar: 20 },
} as const

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
  const frame = deviceMode !== 'desktop' ? FRAME[deviceMode] : null

  useEffect(() => {
    if (!dims || !frame || !containerRef.current) {
      setScale(1)
      return
    }
    const container = containerRef.current
    const totalW = dims.width + frame.bezel * 2
    const totalH = dims.height + frame.bezel * 2
    const update = (): void => {
      const r = container.getBoundingClientRect()
      const pad = 24
      setScale(Math.min((r.width - pad) / totalW, (r.height - pad) / totalH, 1))
    }
    const observer = new ResizeObserver(update)
    observer.observe(container)
    update()
    return () => observer.disconnect()
  }, [deviceMode, dims, frame])

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute inset-0',
        isActive ? 'z-10' : 'z-0 hidden',
        dims && 'flex items-center justify-center bg-zinc-950'
      )}
    >
      {dims && frame ? (
        <div style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5)) drop-shadow(0 8px 16px rgba(0,0,0,0.3))',
        }}>
          <div style={{
            width: dims.width + frame.bezel * 2,
            height: dims.height + frame.bezel * 2,
            borderRadius: frame.radius,
            background: '#1c1c1e',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: frame.bezel,
              left: frame.bezel,
              width: dims.width,
              height: dims.height,
              borderRadius: frame.radius - frame.bezel,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {frame.statusBar > 0 && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: frame.statusBar, zIndex: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: 126, height: 36, borderRadius: 20,
                    background: '#1c1c1e',
                  }} />
                </div>
              )}
              <webview
                ref={webviewRef}
                src={initialUrl.current}
                style={{ width: '100%', height: '100%', display: 'block' }}
                // @ts-expect-error webview attributes not in React types
                allowpopups="true"
                partition={`persist:project-${projectId}`}
              />
              {frame.homeBar > 0 && (
                <div style={{
                  position: 'absolute', bottom: 8, left: '50%',
                  transform: 'translateX(-50%)',
                  width: deviceMode === 'mobile' ? 134 : 180,
                  height: 5, borderRadius: 3, zIndex: 2,
                  background: 'rgba(255,255,255,0.3)',
                }} />
              )}
            </div>
            {deviceMode === 'mobile' && (
              <>
                <div style={{ position: 'absolute', right: -2, top: 180, width: 3, height: 80, borderRadius: '0 2px 2px 0', background: '#333' }} />
                <div style={{ position: 'absolute', left: -2, top: 130, width: 3, height: 24, borderRadius: '2px 0 0 2px', background: '#333' }} />
                <div style={{ position: 'absolute', left: -2, top: 164, width: 3, height: 36, borderRadius: '2px 0 0 2px', background: '#333' }} />
                <div style={{ position: 'absolute', left: -2, top: 210, width: 3, height: 36, borderRadius: '2px 0 0 2px', background: '#333' }} />
              </>
            )}
            {deviceMode === 'ipad' && (
              <div style={{
                position: 'absolute', top: frame.bezel / 2, left: '50%',
                transform: 'translateX(-50%)',
                width: 8, height: 8, borderRadius: '50%',
                background: '#2c2c2e',
              }} />
            )}
          </div>
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
