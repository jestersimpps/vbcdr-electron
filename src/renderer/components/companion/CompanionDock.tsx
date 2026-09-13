import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import modelUrl from '@/assets/models/companion.vrm?url'
import { useLayoutStore } from '@/stores/layout-store'
import { useVoiceStore, type MicStatus } from '@/services/voice/voice-controller'
import { createCompanionStage, type CompanionMood, type CompanionStage } from './companion-stage'
import { GESTURES, type CompanionGesture } from './companion-gestures'
import { CompanionMarkerScanner } from '@/lib/companion-marker'
import { speak, stopSpeech } from '@/lib/companion-speech'

const COMPANION_DEMO = false
const BUBBLE_MS = 6000

const MOOD_BY_MIC: Record<MicStatus, CompanionMood> = {
  off: 'idle',
  starting: 'busy',
  listening: 'attentive',
  hearing: 'attentive',
  transcribing: 'busy',
  thinking: 'thinking',
  error: 'error'
}

export function CompanionDock(): React.ReactElement {
  const micStatus = useVoiceStore((s) => s.micStatus)
  const setCompanionPromptPath = useLayoutStore((s) => s.setCompanionPromptPath)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<CompanionStage | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [bubble, setBubble] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    let disposed = false

    createCompanionStage(canvasRef.current, modelUrl)
      .then((stage) => {
        if (disposed) return stage.dispose()
        stageRef.current = stage
        if (COMPANION_DEMO) {
          stage.onGestureChange((g: CompanionGesture | null) => {
            setLabel(g ? GESTURES[g].label : null)
          })
          stage.setDemoLoop(true)
        }
      })
      .catch((err: unknown) => {
        console.warn('[companion] failed to load:', err)
      })

    return () => {
      disposed = true
      stageRef.current?.dispose()
      stageRef.current = null
    }
  }, [])

  useEffect(() => {
    if (COMPANION_DEMO) return
    stageRef.current?.setMood(MOOD_BY_MIC[micStatus])
  }, [micStatus])

  useEffect(() => {
    let cancelled = false
    window.api.companion
      .ensurePrompt()
      .then((path: string) => {
        if (!cancelled) setCompanionPromptPath(path)
      })
      .catch(() => {
        if (!cancelled) setCompanionPromptPath(null)
      })
    return () => {
      cancelled = true
      setCompanionPromptPath(null)
    }
  }, [setCompanionPromptPath])

  useEffect(() => {
    const scanner = new CompanionMarkerScanner()
    const unsub = window.api.terminal.onData((_tabId: string, data: string) => {
      for (const marker of scanner.push(data)) {
        if (marker.gesture) stageRef.current?.playGesture(marker.gesture)
        if (!marker.text) continue
        setBubble(marker.text)
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
        bubbleTimerRef.current = setTimeout(() => setBubble(null), BUBBLE_MS)
        const { companionSpeechEnabled, companionVoiceId } = useLayoutStore.getState()
        if (companionSpeechEnabled) void speak(marker.text, companionVoiceId)
      }
    })
    return () => {
      unsub()
      stopSpeech()
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const onBlur = (): void => stageRef.current?.setPaused(true)
    const onFocus = (): void => stageRef.current?.setPaused(false)
    const onVisibility = (): void => stageRef.current?.setPaused(document.hidden)

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles size={13} className="shrink-0 text-zinc-500" />
          <span className="shrink-0 text-meta text-zinc-400">Companion</span>
        </div>
        {COMPANION_DEMO && label && (
          <span className="shrink-0 truncate rounded bg-zinc-800/60 px-1.5 py-px font-mono text-micro text-zinc-400">
            {label}
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="h-full w-full" />
        {bubble && (
          <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded border border-zinc-700 bg-zinc-900/90 px-2 py-1 text-micro leading-snug text-zinc-200">
            {bubble}
          </div>
        )}
      </div>
    </div>
  )
}
