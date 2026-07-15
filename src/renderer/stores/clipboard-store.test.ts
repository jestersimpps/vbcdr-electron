import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useClipboardStore } from './clipboard-store'

interface ClipboardApiMock {
  currentImage: ReturnType<typeof vi.fn>
  onImage: ReturnType<typeof vi.fn>
}

let unsub: ReturnType<typeof vi.fn>
let onImageCallback: ((dataUrl: string | null) => void) | null

beforeEach(() => {
  unsub = vi.fn()
  onImageCallback = null
  const clipboard: ClipboardApiMock = {
    currentImage: vi.fn(async () => null),
    onImage: vi.fn((cb: (dataUrl: string | null) => void) => {
      onImageCallback = cb
      return unsub
    })
  }
  ;(window as unknown as { api: { clipboard: ClipboardApiMock } }).api = {
    ...(window as unknown as { api: Record<string, unknown> }).api,
    clipboard
  } as never
  useClipboardStore.setState({ pendingImage: null })
})

describe('clipboard-store', () => {
  it('init() seeds the pending image from the current clipboard and subscribes', async () => {
    const clipboard = (window as unknown as { api: { clipboard: ClipboardApiMock } }).api.clipboard
    clipboard.currentImage.mockResolvedValueOnce('data:seed')

    const off = useClipboardStore.getState().init()
    await vi.waitFor(() => {
      expect(useClipboardStore.getState().pendingImage).toBe('data:seed')
    })
    expect(clipboard.onImage).toHaveBeenCalledTimes(1)
    expect(off).toBe(unsub)
  })

  it('init() leaves pending image null when the clipboard has no image', async () => {
    useClipboardStore.getState().init()
    await Promise.resolve()
    expect(useClipboardStore.getState().pendingImage).toBeNull()
  })

  it('watcher events update and clear the pending image', () => {
    useClipboardStore.getState().init()
    expect(onImageCallback).not.toBeNull()
    onImageCallback!('data:new')
    expect(useClipboardStore.getState().pendingImage).toBe('data:new')
    onImageCallback!(null)
    expect(useClipboardStore.getState().pendingImage).toBeNull()
  })

  it('clearPending() clears the pending image', () => {
    useClipboardStore.setState({ pendingImage: 'data:x' })
    useClipboardStore.getState().clearPending()
    expect(useClipboardStore.getState().pendingImage).toBeNull()
  })
})
