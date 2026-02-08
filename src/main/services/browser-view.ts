import { webContents, BrowserWindow } from 'electron'
import { DEVICE_CONFIGS, type DeviceMode, type NetworkEntry } from '@main/models/types'

interface TrackedTab {
  webContentsId: number
  pendingRequests: Map<string, { method: string; url: string; timestamp: number; type: string }>
}

const trackedTabs = new Map<string, TrackedTab>()

export function attachTab(tabId: string, webContentsId: number, win: BrowserWindow): void {
  detachTab(tabId)

  const wc = webContents.fromId(webContentsId)
  if (!wc) return

  const pendingRequests = new Map<
    string,
    { method: string; url: string; timestamp: number; type: string }
  >()

  trackedTabs.set(tabId, { webContentsId, pendingRequests })

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
        type: params.type || 'Other'
      })
    }

    if (method === 'Network.responseReceived') {
      const pending = pendingRequests.get(params.requestId)
      if (pending) {
        const networkEntry: NetworkEntry = {
          id: params.requestId,
          method: pending.method,
          url: pending.url,
          status: params.response.status,
          type: pending.type,
          size: params.response.headers['content-length']
            ? parseInt(params.response.headers['content-length'])
            : 0,
          duration: params.timestamp * 1000 - pending.timestamp,
          timestamp: pending.timestamp
        }
        win.webContents.send('browser:network', tabId, networkEntry)
        pendingRequests.delete(params.requestId)
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
