import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import modelUrl from '@/assets/models/companion.vrm?url'
import { useLayoutStore } from '@/stores/layout-store'
import { useVoiceStore, type MicStatus } from '@/services/voice/voice-controller'
import { createCompanionStage, type CompanionMood, type CompanionStage } from './companion-stage'
import { GESTURES, IDLE_GESTURES, type CompanionGesture } from './companion-gestures'
import { speak, stopSpeech, onSpeechLevel } from '@/lib/companion-speech'
import { CompanionPoker } from '@/lib/companion-poke'
import { sdlcAnnouncements } from '@/lib/companion-sdlc'
import { renderLine, ProjectVoice, projectNameFor, activeProjectName } from '@/lib/companion-attribution'
import { useSdlcStore } from '@/stores/sdlc-store'
import { sdlcColumns } from '@/stores/sdlc-flow-store'
import type { CompanionEmote } from '@/models/companion'

const COMPANION_DEMO = false
const BUBBLE_MS = 6000

const GESTURE_BY_EMOTE: Record<CompanionEmote, CompanionGesture> = {
  thinking: 'consider',
  running: 'acknowledge',
  happy: 'affirm',
  proud: 'affirm',
  confused: 'wince',
  hurt: 'wince',
  waiting: 'perkUp'
}

/**
 * What she settles into after a line, held for a few seconds. The gesture is
 * the reaction; this is the mood it leaves her in.
 */
const MOOD_BY_EMOTE: Record<CompanionEmote, CompanionMood> = {
  thinking: 'thinking',
  running: 'busy',
  happy: 'attentive',
  proud: 'attentive',
  confused: 'error',
  hurt: 'error',
  waiting: 'attentive'
}

const EMOTE_MOOD_MS = 6000

/** How long nothing may happen before she fidgets. */
const IDLE_AFTER_MS = 5000
/** Well under the gap, or the tick rounds a 5s fidget up to the next poll. */
const IDLE_POLL_MS = 1000
/** Spacing between fidgets, randomised so she is not metronomic about it. */
const IDLE_GAP_MIN_MS = 5000
const IDLE_GAP_MAX_MS = 10_000

function nextIdleGap(): number {
  return IDLE_GAP_MIN_MS + Math.random() * (IDLE_GAP_MAX_MS - IDLE_GAP_MIN_MS)
}

/** Several tickets can move at once; each line stays up at least this long so none is lost to the next. */
const MIN_LINE_MS = 3000
/** A column deleted under a full board moves every ticket in it; past this, the oldest lines are dropped. */
const MAX_QUEUED_LINES = 8

interface Utterance {
  text: string
  emote: CompanionEmote
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const micMoodRef = useRef<CompanionMood>('idle')
  const pausedRef = useRef(false)
  const emoteMoodUntilRef = useRef(0)
  const emoteMoodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    micMoodRef.current = MOOD_BY_MIC[micStatus]
    // A trigger mood outranks the mic for its window, so reacting to the work
    // is not immediately overwritten by the idle microphone state.
    if (emoteMoodUntilRef.current < Date.now()) {
      stageRef.current?.setMood(micMoodRef.current)
    }
  }, [micStatus])

  useEffect(() => {
    const poker = new CompanionPoker()
    const voice = new ProjectVoice()
    const queue: Utterance[] = []
    let draining = false
    let disposed = false
    let lastSpokeAt = -Infinity

    const feelEmote = (emote: CompanionEmote): void => {
      stageRef.current?.setMood(MOOD_BY_EMOTE[emote])
      emoteMoodUntilRef.current = Date.now() + EMOTE_MOOD_MS
      if (emoteMoodTimerRef.current) clearTimeout(emoteMoodTimerRef.current)
      emoteMoodTimerRef.current = setTimeout(() => {
        stageRef.current?.setMood(micMoodRef.current)
      }, EMOTE_MOOD_MS)
    }

    const deliver = async ({ text, emote }: Utterance): Promise<void> => {
      lastSpokeAt = Date.now()
      feelEmote(emote)
      stageRef.current?.playGesture(GESTURE_BY_EMOTE[emote])
      setBubble(text)
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = setTimeout(() => setBubble(null), BUBBLE_MS)
      const { companionSpeechEnabled, companionVoiceId } = useLayoutStore.getState()
      await Promise.all([companionSpeechEnabled ? speak(text, companionVoiceId) : undefined, wait(MIN_LINE_MS)])
    }

    const drain = async (): Promise<void> => {
      if (draining) return
      draining = true
      while (queue.length > 0 && !disposed) await deliver(queue.shift()!)
      draining = false
    }

    const say = (utterance: Utterance): void => {
      queue.push(utterance)
      if (queue.length > MAX_QUEUED_LINES) queue.splice(0, queue.length - MAX_QUEUED_LINES)
      void drain()
    }

    const unsubSdlc = useSdlcStore.subscribe((state, previous) => {
      if (state.tickets === previous.tickets) return
      for (const announcement of sdlcAnnouncements(previous.tickets, state.tickets, sdlcColumns, projectNameFor)) {
        say(announcement)
      }
    })

    pokeRef.current = () => {
      const reaction = poker.poke()
      say({ text: renderLine(reaction.line, voice.nameFor(activeProjectName())), emote: reaction.emote })
    }

    // Silent on purpose: no bubble, no speech, no mood change. She is just not
    // a statue between tickets. The mount time floors the quiet clock so she
    // does not fidget the instant she loads.
    const mountedAt = Date.now()
    let idleDue = nextIdleGap()
    const idleTimer = setInterval(() => {
      if (pausedRef.current || draining) return
      const quiet = Date.now() - Math.max(lastSpokeAt, mountedAt)
      if (quiet < IDLE_AFTER_MS || quiet < idleDue) return
      idleDue = quiet + nextIdleGap()
      stageRef.current?.playGesture(IDLE_GESTURES[Math.floor(Math.random() * IDLE_GESTURES.length)])
    }, IDLE_POLL_MS)

    return () => {
      disposed = true
      clearInterval(idleTimer)
      unsubSdlc()
      stopSpeech()
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = null
      if (emoteMoodTimerRef.current) clearTimeout(emoteMoodTimerRef.current)
      emoteMoodTimerRef.current = null
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
    const setPaused = (next: boolean): void => {
      pausedRef.current = next
      stageRef.current?.setPaused(next)
    }
    const onBlur = (): void => setPaused(true)
    const onFocus = (): void => setPaused(false)
    const onVisibility = (): void => setPaused(document.hidden)

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
