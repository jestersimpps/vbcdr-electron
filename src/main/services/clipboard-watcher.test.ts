import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readImage = vi.fn<() => unknown>(() => makeEmptyImage())

vi.mock('electron', () => ({
  clipboard: {
    readImage: () => readImage()
  }
}))

interface FakeImage {
  isEmpty: () => boolean
  toPNG: () => Buffer
  getSize: () => { width: number; height: number }
  resize: (opts: { width: number }) => FakeImage
  toDataURL: () => string
}

function makeEmptyImage(): FakeImage {
  return {
    isEmpty: () => true,
    toPNG: () => Buffer.alloc(0),
    getSize: () => ({ width: 0, height: 0 }),
    resize: () => makeEmptyImage(),
    toDataURL: () => ''
  }
}

function makeImage(content: string, width = 100): FakeImage {
  return {
    isEmpty: () => false,
    toPNG: () => Buffer.from(content),
    getSize: () => ({ width, height: 50 }),
    resize: ({ width: w }) => makeImage(`${content}@${w}`, w),
    toDataURL: () => `data:${content}`
  }
}

interface FakeWin {
  destroyed: boolean
  focused: boolean
  isDestroyed: () => boolean
  isFocused: () => boolean
  on: ReturnType<typeof vi.fn>
  webContents: { send: ReturnType<typeof vi.fn> }
}

function makeWin(): FakeWin {
  const win: FakeWin = {
    destroyed: false,
    focused: true,
    isDestroyed: () => win.destroyed,
    isFocused: () => win.focused,
    on: vi.fn(),
    webContents: { send: vi.fn() }
  }
  return win
}

function setClipboardImage(image: FakeImage | null): void {
  readImage.mockReturnValue(image ?? makeEmptyImage())
}

let watcher: typeof import('./clipboard-watcher')

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  readImage.mockReset().mockReturnValue(makeEmptyImage())
  watcher = await import('./clipboard-watcher')
})

afterEach(() => {
  watcher.stopClipboardWatcher()
  vi.useRealTimers()
})

describe('clipboard-watcher', () => {
  it('announces a new clipboard image once and not again for the same image', () => {
    const win = makeWin()
    watcher.startClipboardWatcher(win as never)
    setClipboardImage(makeImage('img-a'))

    vi.advanceTimersByTime(1000)
    expect(win.webContents.send).toHaveBeenCalledWith('clipboard:image', 'data:img-a')

    vi.advanceTimersByTime(3000)
    expect(win.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('announces a replacement image with a different signature', () => {
    const win = makeWin()
    watcher.startClipboardWatcher(win as never)
    setClipboardImage(makeImage('img-a'))
    vi.advanceTimersByTime(1000)
    setClipboardImage(makeImage('img-b'))
    vi.advanceTimersByTime(1000)
    expect(win.webContents.send).toHaveBeenLastCalledWith('clipboard:image', 'data:img-b')
    expect(win.webContents.send).toHaveBeenCalledTimes(2)
  })

  it('sends null when the image leaves the clipboard', () => {
    const win = makeWin()
    watcher.startClipboardWatcher(win as never)
    setClipboardImage(makeImage('img-a'))
    vi.advanceTimersByTime(1000)
    setClipboardImage(null)
    vi.advanceTimersByTime(1000)
    expect(win.webContents.send).toHaveBeenLastCalledWith('clipboard:image', null)
  })

  it('skips polling while the window is not focused and catches up on focus', () => {
    const win = makeWin()
    win.focused = false
    watcher.startClipboardWatcher(win as never)
    setClipboardImage(makeImage('img-a'))

    vi.advanceTimersByTime(5000)
    expect(win.webContents.send).not.toHaveBeenCalled()

    win.focused = true
    const onFocus = win.on.mock.calls.find((c) => c[0] === 'focus')?.[1] as () => void
    onFocus()
    expect(win.webContents.send).toHaveBeenCalledWith('clipboard:image', 'data:img-a')
  })

  it('does not announce an image marked as suppressed', () => {
    const win = makeWin()
    watcher.startClipboardWatcher(win as never)
    setClipboardImage(makeImage('img-a'))
    watcher.suppressCurrentClipboardImage()

    vi.advanceTimersByTime(3000)
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('scales wide images down to the thumbnail width', () => {
    const win = makeWin()
    watcher.startClipboardWatcher(win as never)
    setClipboardImage(makeImage('big', 2000))
    vi.advanceTimersByTime(1000)
    expect(win.webContents.send).toHaveBeenCalledWith('clipboard:image', 'data:big@280')
  })

  it('readClipboardImageThumbnail returns the current image or null', () => {
    expect(watcher.readClipboardImageThumbnail()).toBeNull()
    setClipboardImage(makeImage('img-a'))
    expect(watcher.readClipboardImageThumbnail()).toBe('data:img-a')
  })
})
