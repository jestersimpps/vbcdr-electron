import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import modelUrl from '@/assets/models/companion.vrm?url'
import { useLayoutStore } from '@/stores/layout-store'
import { useVoiceStore, type MicStatus } from '@/services/voice/voice-controller'
import { createCompanionStage, type CompanionMood, type CompanionStage } from './companion-stage'
import { GESTURES, type CompanionGesture } from './companion-gestures'
import { CompanionMarkerScanner } from '@/lib/companion-marker'
import { speak, stopSpeech, onSpeechLevel } from '@/lib/companion-speech'
import { CompanionMatcher } from '@/lib/companion-triggers'
import { CompanionLineFeed } from '@/lib/companion-buffer-lines'
import { onCompanionRows } from '@/lib/companion-buffer-feed'
import type { CompanionEmote } from '@/config/companion-trigger-registry'
import { playSound } from '@/lib/sound'

const COMPANION_DEMO = false
const BUBBLE_MS = 6000

const GESTURE_BY_EMOTE: Record<CompanionEmote, CompanionGesture> = {
  thinking: 'consider',
  reading: 'thinkingAside',
  writing: 'acknowledge',
  searching: 'thinkingAside',
  running: 'acknowledge',
  happy: 'affirm',
  proud: 'affirm',
  confused: 'wince',
  hurt: 'wince',
  sheepish: 'wince',
  waiting: 'perkUp',
  sleeping: 'consider'
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<CompanionStage | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pokeRef = useRef<(() => void) | null>(null)
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
    const scanner = new CompanionMarkerScanner()
    const matcher = new CompanionMatcher()
    const feed = new CompanionLineFeed()

    const say = (text: string, gesture: CompanionGesture | null, soundId?: string): void => {
      if (gesture) stageRef.current?.playGesture(gesture)
      if (soundId) playSound(soundId)
      setBubble(text)
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = setTimeout(() => setBubble(null), BUBBLE_MS)
      const { companionSpeechEnabled, companionVoiceId } = useLayoutStore.getState()
      if (companionSpeechEnabled) void speak(text, companionVoiceId)
    }

    const unsubMarkers = window.api.terminal.onData((_tabId: string, data: string) => {
      for (const marker of scanner.push(data)) {
        // An authored line always wins, and buys silence from the regex side.
        matcher.suppress()
        if (marker.gesture) stageRef.current?.playGesture(marker.gesture)
        if (!marker.text) continue
        say(marker.text, marker.gesture)
      }
    })

    const unsubRows = onCompanionRows((tabId: string, rows: string[]) => {
      for (const line of feed.push(tabId, rows)) {
        const reaction = matcher.match(line)
        if (!reaction) continue
        say(reaction.line, GESTURE_BY_EMOTE[reaction.emote], reaction.soundId)
        break
      }
    })

    pokeRef.current = () => {
      const reaction = matcher.poke()
      say(reaction.line, GESTURE_BY_EMOTE[reaction.emote])
    }

    return () => {
      unsubMarkers()
      unsubRows()
      stopSpeech()
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return onSpeechLevel((level: number) => stageRef.current?.setMouthLevel(level))
  }, [])

  useEffect(() => {
    // Tracked window-wide rather than over the canvas: the dock is small, and
    // the point is that she watches what you are doing elsewhere on screen.
    const onPointerMove = (e: PointerEvent): void => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      // Separate spans per axis, measured to the furthest edge from the canvas
      // centre. A single shared span is dominated by the wider axis, which on a
      // landscape window flattens vertical gaze to almost nothing — and since
      // the dock sits low, "almost nothing" is exactly the upward direction.
      const spanX = Math.max(cx, window.innerWidth - cx, 1)
      const spanY = Math.max(cy, window.innerHeight - cy, 1)
      stageRef.current?.setLookAt({ x: (e.clientX - cx) / spanX, y: (e.clientY - cy) / spanY })
    }
    const onPointerLeave = (): void => stageRef.current?.setLookAt(null)

    window.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerleave', onPointerLeave)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
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
        <canvas
          ref={canvasRef}
          onClick={() => pokeRef.current?.()}
          className="h-full w-full cursor-pointer"
        />
        {bubble && (
          <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded border border-zinc-700 bg-zinc-900/90 px-2 py-1 text-micro leading-snug text-zinc-200">
            {bubble}
          </div>
        )}
      </div>
    </div>
  )
}
