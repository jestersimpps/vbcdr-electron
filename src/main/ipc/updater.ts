import { safeHandle } from '@main/ipc/safe-handle'
import { checkForUpdates, quitAndInstall, getUpdateStatus } from '@main/services/auto-updater'

export function registerUpdaterHandlers(): void {
  safeHandle('updater:check', () => {
    checkForUpdates()
  })

  safeHandle('updater:install', () => {
    quitAndInstall()
  })

  safeHandle('updater:status', () => {
    return getUpdateStatus()
  })
}
