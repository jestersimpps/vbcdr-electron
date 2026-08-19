import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import { dialog, net } from 'electron'
import { broadcastToAllWindows } from '@main/services/window-broadcast'

export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  error?: string
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

let currentStatus: UpdateStatus = { state: 'idle' }
let checkTimer: NodeJS.Timeout | null = null

function broadcast(status: UpdateStatus): void {
  currentStatus = status
  broadcastToAllWindows('updater:status', status)
}

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    broadcast({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast({ state: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    broadcast({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    if (err.message?.includes('404')) return
    if (isOfflineError(err)) {
      broadcast({ state: 'idle' })
      return
    }
    broadcast({ state: 'error', error: err.message })
  })
}

const OFFLINE_ERROR_CODES = [
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENETDOWN',
  'ETIMEDOUT',
  'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_CONNECTION_TIMED_OUT'
]

function isOfflineError(err: Error): boolean {
  const message = err.message ?? ''
  return OFFLINE_ERROR_CODES.some((code) => message.includes(code))
}

export function checkForUpdates(): void {
  if (!net.isOnline()) return
  autoUpdater.checkForUpdates().catch(() => {})
}

export function startUpdateChecks(): void {
  if (checkTimer) return
  checkForUpdates()
  checkTimer = setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS)
}

export function stopUpdateChecks(): void {
  if (!checkTimer) return
  clearInterval(checkTimer)
  checkTimer = null
}

export async function checkForUpdatesInteractive(): Promise<void> {
  if (!net.isOnline()) {
    dialog.showMessageBox({
      type: 'info',
      title: 'No Connection',
      message: 'You appear to be offline',
      detail: 'Connect to the internet and try again.'
    })
    return
  }

  const result = await autoUpdater.checkForUpdates().catch((err: Error) => {
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: isOfflineError(err) ? 'Could not reach the update server' : 'Could not check for updates',
      detail: err.message
    })
    return null
  })

  if (!result) return

  if (result.updateInfo.version === autoUpdater.currentVersion.version) {
    dialog.showMessageBox({
      type: 'info',
      title: 'No Updates',
      message: 'You\'re on the latest version',
      detail: `vbcdr v${autoUpdater.currentVersion.version}`
    })
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}
