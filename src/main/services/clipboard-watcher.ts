import { BrowserWindow, clipboard } from 'electron'
import { createHash } from 'crypto'

const POLL_INTERVAL_MS = 1000
const THUMBNAIL_WIDTH = 280

let timer: ReturnType<typeof setInterval> | null = null
let lastSignature: string | null = null
let hadImage = false

function signatureOf(image: Electron.NativeImage): string {
  return createHash('sha1').update(image.toPNG()).digest('hex')
}

function toThumbnailDataUrl(image: Electron.NativeImage): string {
  const { width } = image.getSize()
  const thumb = width > THUMBNAIL_WIDTH ? image.resize({ width: THUMBNAIL_WIDTH }) : image
  return thumb.toDataURL()
}

export function readClipboardImageThumbnail(): string | null {
  const image = clipboard.readImage()
  if (image.isEmpty()) return null
  return toThumbnailDataUrl(image)
}

function poll(win: BrowserWindow): void {
  if (win.isDestroyed() || !win.isFocused()) return

  // macOS screenshots land on the pasteboard as TIFF, which availableFormats()
  // does not reliably report as image/* — readImage() converts it regardless
  const image = clipboard.readImage()

  if (image.isEmpty()) {
    lastSignature = null
    if (hadImage) {
      hadImage = false
      win.webContents.send('clipboard:image', null)
    }
    return
  }

  const signature = signatureOf(image)
  if (signature === lastSignature) return
  lastSignature = signature
  hadImage = true
  win.webContents.send('clipboard:image', toThumbnailDataUrl(image))
}

export function startClipboardWatcher(win: BrowserWindow): void {
  stopClipboardWatcher()
  timer = setInterval(() => poll(win), POLL_INTERVAL_MS)
  win.on('focus', () => poll(win))
}

export function stopClipboardWatcher(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function suppressCurrentClipboardImage(): void {
  const image = clipboard.readImage()
  if (image.isEmpty()) return
  lastSignature = signatureOf(image)
  hadImage = true
}
