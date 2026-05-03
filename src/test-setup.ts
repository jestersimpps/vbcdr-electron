import { beforeEach, vi } from 'vitest'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

const ls = new MemoryStorage()
const ss = new MemoryStorage()

Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: ls })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: ss })
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: ls })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, writable: true, value: ss })
}

beforeEach(() => {
  ls.clear()
  ss.clear()
})

type AnyFn = (...args: unknown[]) => unknown

function fn<T extends AnyFn>(impl?: T): ReturnType<typeof vi.fn> {
  return impl ? vi.fn(impl as AnyFn) : vi.fn()
}

const api = {
  projects: {
    list: fn(async () => []),
    add: fn(async () => null),
    remove: fn(async () => undefined),
    reorder: fn(async () => undefined)
  },
  terminal: {
    has: fn(async () => true),
    kill: fn(async () => undefined),
    write: fn(async () => undefined)
  },
  git: {
    isRepo: fn(async () => false),
    commits: fn(async () => []),
    branches: fn(async () => []),
    status: fn(async () => ({})),
    checkout: fn(async () => ({ success: true, branch: 'main', stashed: false })),
    conflicts: fn(async () => []),
    pull: fn(async () => undefined),
    rebaseRemote: fn(async () => undefined),
    registerFetch: fn(() => undefined),
    onDrift: fn(() => () => undefined),
    commitsFileCounts: fn(async () => ({})),
    rangeFileCount: fn(async () => 0),
    rangeHashes: fn(async () => [])
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: api
  })
} else {
  ;(globalThis as unknown as { window: { api: typeof api } }).window = { api } as { api: typeof api }
}

declare global {
  interface Window {
    api: typeof api
  }
}
