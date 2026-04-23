import { useEffect, useRef, useState } from 'react'
import { useTerminalStore } from '@/stores/terminal-store'

interface TokenSample {
  t: number
  tokens: number
}

interface TokenVelocity {
  samples: TokenSample[]
  velocityPerSample: number[]
  tokensPerMinute: number
}

const SAMPLE_INTERVAL_MS = 1000
const WINDOW_MS = 60_000
const MAX_SAMPLES = Math.ceil(WINDOW_MS / SAMPLE_INTERVAL_MS)

export function useTokenVelocity(tabId: string | null): TokenVelocity {
  const [samples, setSamples] = useState<TokenSample[]>([])
  const samplesRef = useRef<TokenSample[]>([])

  useEffect(() => {
    samplesRef.current = []
    setSamples([])
    if (!tabId) return

    const tick = (): void => {
      const tokens = useTerminalStore.getState().tokenUsagePerTab[tabId]
      if (tokens == null) return
      const now = Date.now()
      let next: TokenSample[]
      if (samplesRef.current.length === 0) {
        next = [
          { t: now - SAMPLE_INTERVAL_MS, tokens },
          { t: now, tokens }
        ]
      } else {
        next = [...samplesRef.current, { t: now, tokens }]
      }
      const cutoff = now - WINDOW_MS
      const trimmed = next.filter((s) => s.t >= cutoff).slice(-MAX_SAMPLES)
      samplesRef.current = trimmed
      setSamples(trimmed)
    }

    tick()
    const id = setInterval(tick, SAMPLE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [tabId])

  const tokensPerMinute = computeTokensPerMinute(samples)
  const velocityPerSample = computeVelocityPerSample(samples)
  return { samples, velocityPerSample, tokensPerMinute }
}

function computeVelocityPerSample(samples: TokenSample[]): number[] {
  if (samples.length < 2) return []
  const out: number[] = []
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]
    const cur = samples[i]
    const elapsedMs = cur.t - prev.t
    if (elapsedMs <= 0) {
      out.push(0)
      continue
    }
    const delta = Math.max(0, cur.tokens - prev.tokens)
    out.push((delta / elapsedMs) * 60_000)
  }
  return out
}

function computeTokensPerMinute(samples: TokenSample[]): number {
  if (samples.length < 2) return 0
  const first = samples[0]
  const last = samples[samples.length - 1]
  const elapsedMs = last.t - first.t
  if (elapsedMs <= 0) return 0
  const delta = Math.max(0, last.tokens - first.tokens)
  return Math.round((delta / elapsedMs) * 60_000)
}
