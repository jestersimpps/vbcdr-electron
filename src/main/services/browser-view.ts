import { webContents, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { DEVICE_CONFIGS, type DeviceMode, type NetworkEntry } from '@main/models/types'
import type { TabInfo } from '@main/models/api-types'

interface PendingRequest {
  method: string
  url: string
  timestamp: number
  type: string
  headers: Record<string, string>
  postData?: string
}

interface ResponseData {
  pending: PendingRequest
  status: number
  statusText: string
  mimeType: string
  remoteAddress: string
  protocol: string
  responseHeaders: Record<string, string>
  duration: number
}

interface CachedBody {
  body: string
  base64Encoded: boolean
}

interface TrackedTab {
  webContentsId: number
  pendingRequests: Map<string, PendingRequest>
  pendingResponses: Map<string, ResponseData>
  bodyCache: Map<string, CachedBody>
}

const trackedTabs = new Map<string, TrackedTab>()

export function attachTab(tabId: string, webContentsId: number, win: BrowserWindow): void {
  detachTab(tabId)

  const wc = webContents.fromId(webContentsId)
  if (!wc) return

  const pendingRequests = new Map<string, PendingRequest>()
  const pendingResponses = new Map<string, ResponseData>()
  const bodyCache = new Map<string, CachedBody>()

  trackedTabs.set(tabId, { webContentsId, pendingRequests, pendingResponses, bodyCache })

  try {
    wc.debugger.attach('1.3')
  } catch {
    return
  }

  wc.debugger.sendCommand('Network.enable')

  wc.debugger.on('message', async (_event, method, params) => {
    if (win.isDestroyed()) return

    if (method === 'Network.requestWillBeSent') {
      pendingRequests.set(params.requestId, {
        method: params.request.method,
        url: params.request.url,
        timestamp: params.timestamp * 1000,
        type: params.type || 'Other',
        headers: params.request.headers ?? {},
        postData: params.request.postData
      })
    }

    if (method === 'Network.responseReceived') {
      const pending = pendingRequests.get(params.requestId)
      if (pending) {
        const resp = params.response
        pendingResponses.set(params.requestId, {
          pending,
          status: resp.status,
          statusText: resp.statusText ?? '',
          mimeType: resp.mimeType ?? '',
          remoteAddress: resp.remoteIPAddress
            ? `${resp.remoteIPAddress}:${resp.remotePort ?? ''}`
            : '',
          protocol: resp.protocol ?? '',
          responseHeaders: resp.headers ?? {},
          duration: params.timestamp * 1000 - pending.timestamp
        })
        pendingRequests.delete(params.requestId)
      }
    }

    if (method === 'Network.loadingFinished') {
      const data = pendingResponses.get(params.requestId)
      if (data) {
        const networkEntry: NetworkEntry = {
          id: params.requestId,
          method: data.pending.method,
          url: data.pending.url,
          status: data.status,
          statusText: data.statusText,
          type: data.pending.type,
          size: params.encodedDataLength ?? 0,
          duration: data.duration,
          timestamp: data.pending.timestamp,
          mimeType: data.mimeType,
          remoteAddress: data.remoteAddress,
          protocol: data.protocol,
          requestHeaders: data.pending.headers,
          responseHeaders: data.responseHeaders,
          postData: data.pending.postData
        }
        win.webContents.send('browser:network', tabId, networkEntry)
        pendingResponses.delete(params.requestId)

        try {
          const result = await wc.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
          if (bodyCache.size >= 500) {
            const oldest = bodyCache.keys().next().value!
            bodyCache.delete(oldest)
          }
          bodyCache.set(params.requestId, { body: result.body, base64Encoded: result.base64Encoded })
        } catch { /* body may not be available for some requests */ }
      }
    }
  })
}

export function setDevice(tabId: string, mode: DeviceMode): void {
  const entry = trackedTabs.get(tabId)
  if (!entry) return
  const wc = webContents.fromId(entry.webContentsId)
  if (!wc) return

  const config = DEVICE_CONFIGS[mode]

  if (mode === 'desktop') {
    wc.disableDeviceEmulation()
    wc.setUserAgent(wc.session.getUserAgent())
  } else {
    wc.enableDeviceEmulation({
      screenPosition: mode === 'mobile' ? 'mobile' : 'desktop',
      screenSize: { width: config.width, height: config.height },
      viewPosition: { x: 0, y: 0 },
      viewSize: { width: config.width, height: config.height },
      deviceScaleFactor: 2,
      scale: 1
    })
    wc.setUserAgent(config.userAgent)
  }
}

export function clearBodyCache(tabId: string): void {
  const entry = trackedTabs.get(tabId)
  if (entry) entry.bodyCache.clear()
}

export function detachTab(tabId: string): void {
  const entry = trackedTabs.get(tabId)
  if (entry) {
    try {
      const wc = webContents.fromId(entry.webContentsId)
      if (wc && wc.debugger.isAttached()) {
        wc.debugger.detach()
      }
    } catch {
      // webContents may already be destroyed
    }
  }
  trackedTabs.delete(tabId)
}

export async function getResponseBody(tabId: string, requestId: string): Promise<{ body: string; base64Encoded: boolean }> {
  const entry = trackedTabs.get(tabId)
  if (!entry) throw new Error('Tab not tracked')

  const cached = entry.bodyCache.get(requestId)
  if (cached) return cached

  const wc = webContents.fromId(entry.webContentsId)
  if (!wc || !wc.debugger.isAttached()) throw new Error('Debugger not attached')
  const result = await wc.debugger.sendCommand('Network.getResponseBody', { requestId })
  const body = { body: result.body, base64Encoded: result.base64Encoded }
  entry.bodyCache.set(requestId, body)
  return body
}

export async function capturePageHtml(tabId: string): Promise<string> {
  const entry = trackedTabs.get(tabId)
  if (!entry) throw new Error('Tab not tracked')
  const wc = webContents.fromId(entry.webContentsId)
  if (!wc) throw new Error('WebContents not found')
  return await wc.executeJavaScript('document.documentElement.outerHTML')
}

export async function capturePageScreenshot(
  tabId: string,
  options?: {
    width?: number
    height?: number
    quality?: number
    format?: 'png' | 'jpeg'
  }
): Promise<string> {
  const entry = trackedTabs.get(tabId)
  if (!entry) throw new Error('Tab not tracked')
  const wc = webContents.fromId(entry.webContentsId)
  if (!wc) throw new Error('WebContents not found')

  let image = await wc.capturePage()

  if (options?.width || options?.height) {
    const size = image.getSize()
    const targetWidth = options.width ?? size.width
    const targetHeight = options.height ?? size.height
    image = image.resize({ width: targetWidth, height: targetHeight })
  }

  const format = options?.format ?? 'png'
  const buffer = format === 'jpeg'
    ? image.toJPEG(options?.quality ?? 80)
    : image.toPNG()

  const tmpDir = app.getPath('temp')
  const ext = format === 'jpeg' ? 'jpg' : 'png'
  const filePath = path.join(tmpDir, `vc-screenshot-${Date.now()}.${ext}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

export function getTabWebContents(tabId: string): Electron.WebContents | null {
  const entry = trackedTabs.get(tabId)
  if (!entry) return null
  return webContents.fromId(entry.webContentsId) ?? null
}

export function listTrackedTabs(): TabInfo[] {
  const trackedIds = new Set<number>()
  const tabs: TabInfo[] = []
  for (const [id, entry] of trackedTabs) {
    const wc = webContents.fromId(entry.webContentsId)
    if (wc) {
      trackedIds.add(wc.id)
      tabs.push({ id, url: wc.getURL(), title: wc.getTitle() })
    }
  }
  for (const wc of webContents.getAllWebContents()) {
    if (wc.getType() === 'webview' && !trackedIds.has(wc.id)) {
      const autoId = `auto-${wc.id}`
      trackedTabs.set(autoId, {
        webContentsId: wc.id,
        pendingRequests: new Map(),
        pendingResponses: new Map(),
        bodyCache: new Map()
      })
      tabs.push({ id: autoId, url: wc.getURL(), title: wc.getTitle() })
    }
  }
  return tabs
}

export function detachAllTabs(): void {
  for (const tabId of [...trackedTabs.keys()]) {
    detachTab(tabId)
  }
}
