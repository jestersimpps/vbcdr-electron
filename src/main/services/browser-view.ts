import { webContents, BrowserWindow } from 'electron'
import { DEVICE_CONFIGS, type DeviceMode, type NetworkEntry } from '@main/models/types'

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

interface TrackedTab {
  webContentsId: number
  pendingRequests: Map<string, PendingRequest>
  pendingResponses: Map<string, ResponseData>
}

const trackedTabs = new Map<string, TrackedTab>()

export function attachTab(tabId: string, webContentsId: number, win: BrowserWindow): void {
  detachTab(tabId)

  const wc = webContents.fromId(webContentsId)
  if (!wc) return

  const pendingRequests = new Map<string, PendingRequest>()
  const pendingResponses = new Map<string, ResponseData>()

  trackedTabs.set(tabId, { webContentsId, pendingRequests, pendingResponses })

  try {
    wc.debugger.attach('1.3')
  } catch {
    return
  }

  wc.debugger.sendCommand('Network.enable')

  wc.debugger.on('message', (_event, method, params) => {
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

export function detachAllTabs(): void {
  for (const tabId of [...trackedTabs.keys()]) {
    detachTab(tabId)
  }
}
