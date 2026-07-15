import { safeHandle } from '@main/ipc/safe-handle'
import { readClipboardImageThumbnail } from '@main/services/clipboard-watcher'

export function registerClipboardHandlers(): void {
  safeHandle('clipboard:current-image', (): string | null => {
    return readClipboardImageThumbnail()
  })
}
