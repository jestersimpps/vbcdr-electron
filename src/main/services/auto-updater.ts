import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'

export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  error?: string
}

let currentStatus: UpdateStatus = { state: 'idle' }

function broadcast(status: UpdateStatus): void {
  currentStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', status)
  }
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
    broadcast({ state: 'error', error: err.message })
  })
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch(() => {})
}

export async function checkForUpdatesInteractive(): Promise<void> {
  const result = await autoUpdater.checkForUpdates().catch((err: Error) => {
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: 'Could not check for updates',
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
