import { useSyncExternalStore } from 'react'

const TICK_MS = 1000

let now = Date.now()
const listeners = new Set<() => void>()
let interval: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!interval) {
    now = Date.now()
    interval = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && interval) {
      clearInterval(interval)
      interval = null
    }
  }
}

function getSnapshot(): number {
  return now
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
