import { useState, useEffect } from 'react'
import type { SpotlightRect } from '@/models/tutorial'

const PADDING = 6

function measure(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2
  }
}

export interface SpotlightState {
  rect: SpotlightRect | null
  missing: boolean
}

const GIVE_UP_MS = 1200

export function useSpotlight(target: string | undefined, active: boolean): SpotlightState {
  const [rect, setRect] = useState<SpotlightRect | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
    if (!active || !target) {
      setRect(null)
      return
    }

    let frame = 0
    const startedAt = performance.now()
    let everFound = false

    const update = (): void => {
      const next = measure(target)
      if (next) everFound = true
      if (!next && !everFound && performance.now() - startedAt > GIVE_UP_MS) {
        setMissing(true)
      }
      setRect((prev) => {
        if (!next || !prev) return next
        if (
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev
        }
        return next
      })
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)

    return () => cancelAnimationFrame(frame)
  }, [target, active])

  return { rect, missing }
}
