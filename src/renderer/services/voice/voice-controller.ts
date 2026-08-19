import { create } from 'zustand'
import { dispatchAppAction, ACTION_SPECS, type DispatchResult } from '@/lib/app-actions'
import { buildStateSnapshot } from '@/lib/voice/state-snapshot'
import {
  AgentLineBuffer,
  DICTATE_ACTION,
  buildProtocolPreamble,
  isKnownAction,
  parseAgentAction,
  type AgentAction
} from '@/lib/voice/agent-protocol'
import { matchFastPath } from '@/lib/voice/fast-path'
import { useLayoutStore } from '@/stores/layout-store'
import { useProjectStore } from '@/stores/project-store'
import { providerDefinition } from '@/config/llm-provider-registry'

import { SileroVad } from '@/services/voice/vad'
import { Transcriber } from '@/services/voice/transcriber'

export type VoiceAgentStatus = 'stopped' | 'starting' | 'ready' | 'degraded'
export type MicStatus =
  | 'off'
  | 'starting'
  | 'listening'
  | 'hearing'
  | 'transcribing'
  | 'thinking'
  | 'error'

export interface VoiceHistoryEntry {
  id: number
  transcript: string
  action?: AgentAction
  outcome: string
  ok: boolean
  source: 'agent' | 'fast-path' | 'fallback'
}

export interface PendingConfirmation {
  action: string
  target?: string
  transcript: string
}

interface VoiceControllerState {
  status: VoiceAgentStatus
  detail?: string
  micStatus: MicStatus
  micDetail?: string
  level: number
  history: VoiceHistoryEntry[]
  pending: PendingConfirmation | null
  awaiting: boolean
  unparseableStreak: number
  push: (entry: Omit<VoiceHistoryEntry, 'id'>) => void
  setStatus: (status: VoiceAgentStatus, detail?: string) => void
  setMicStatus: (status: MicStatus, detail?: string) => void
  setLevel: (level: number) => void
  setPending: (pending: PendingConfirmation | null) => void
  setAwaiting: (awaiting: boolean) => void
  clear: () => void
}

let nextId = 1

export const useVoiceStore = create<VoiceControllerState>((set) => ({
  status: 'stopped',
  micStatus: 'off',
  level: 0,
  history: [],
  pending: null,
  awaiting: false,
  unparseableStreak: 0,
  push: (entry) =>
    set((s) => ({ history: [...s.history, { ...entry, id: nextId++ }].slice(-200) })),
  setStatus: (status, detail) => set({ status, detail }),
  setMicStatus: (micStatus, micDetail) => set({ micStatus, micDetail }),
  setLevel: (level) => set({ level }),
  setPending: (pending) => set({ pending }),
  setAwaiting: (awaiting) => set({ awaiting }),
  clear: () => set({ history: [] })
}))

const lineBuffer = new AgentLineBuffer()
let currentTranscript = ''
let unsubData: (() => void) | null = null
let unsubStatus: (() => void) | null = null
let resolveTurn: (() => void) | null = null

const UNPARSEABLE_LIMIT = 3

function applyDispatch(action: AgentAction, transcript: string, source: VoiceHistoryEntry['source']): void {
  const store = useVoiceStore.getState()

  if (action.action === DICTATE_ACTION) {
    store.push({
      transcript,
      action,
      outcome: action.target ?? '(nothing to dictate)',
      ok: true,
      source
    })
    return
  }

  if (!isKnownAction(action.action)) {
    store.push({
      transcript,
      action,
      outcome: `Blocked unknown action "${action.action}"`,
      ok: false,
      source
    })
    return
  }

  const spec = ACTION_SPECS[action.action]
  if (spec?.destructive && useLayoutStore.getState().voiceConfirmDestructive) {
    store.setPending({ action: action.action, target: action.target, transcript })
    store.push({
      transcript,
      action,
      outcome: `Waiting for confirmation: ${action.action}`,
      ok: true,
      source
    })
    return
  }

  runDispatch(action, transcript, source)
}

function runDispatch(action: AgentAction, transcript: string, source: VoiceHistoryEntry['source']): void {
  const result: DispatchResult = dispatchAppAction({
    action: action.action,
    target: action.target
  })
  useVoiceStore.getState().push({
    transcript,
    action,
    outcome: result.ok ? (action.say ?? result.say) : `Failed: ${result.reason}`,
    ok: result.ok,
    source
  })
}

export function confirmPending(): void {
  const store = useVoiceStore.getState()
  const pending = store.pending
  if (!pending) return
  store.setPending(null)
  runDispatch({ action: pending.action, target: pending.target }, pending.transcript, 'agent')
}

export function cancelPending(): void {
  const store = useVoiceStore.getState()
  const pending = store.pending
  if (!pending) return
  store.setPending(null)
  store.push({
    transcript: pending.transcript,
    outcome: `Cancelled ${pending.action}`,
    ok: false,
    source: 'agent'
  })
}

function handleAgentLine(line: string): void {
  const parsed = parseAgentAction(line)
  if (!parsed) return

  const store = useVoiceStore.getState()
  useVoiceStore.setState({ unparseableStreak: 0 })
  store.setAwaiting(false)
  applyDispatch(parsed, currentTranscript, 'agent')
  resolveTurn?.()
  resolveTurn = null
}

export function attachVoiceAgentListeners(): void {
  detachVoiceAgentListeners()
  unsubData = window.api.voiceAgent.onData((chunk) => {
    for (const line of lineBuffer.push(chunk)) handleAgentLine(line)
  })
  unsubStatus = window.api.voiceAgent.onStatus(({ status, detail }) => {
    useVoiceStore.getState().setStatus(status as VoiceAgentStatus, detail)
  })
}

export function detachVoiceAgentListeners(): void {
  unsubData?.()
  unsubStatus?.()
  unsubData = null
  unsubStatus = null
}

export async function startVoiceAgent(): Promise<boolean> {
  const layout = useLayoutStore.getState()
  const projectStore = useProjectStore.getState()
  const cwd =
    projectStore.projects.find((p) => p.id === projectStore.activeProjectId)?.path ??
    layout.globalTerminalCwd ??
    ''

  const providerId = layout.getVoiceAgentProviderId()
  const command = layout.getVoiceAgentCommand()
  const readyPattern = providerDefinition(providerId).readyPattern

  attachVoiceAgentListeners()
  return window.api.voiceAgent.start(
    cwd,
    command,
    buildProtocolPreamble(),
    readyPattern ? readyPattern.source : undefined
  )
}

export async function stopVoiceAgent(): Promise<void> {
  detachVoiceAgentListeners()
  await window.api.voiceAgent.stop()
  useVoiceStore.getState().setStatus('stopped')
}

const vad = new SileroVad()
const transcriber = new Transcriber()

export async function startListening(): Promise<boolean> {
  const store = useVoiceStore.getState()
  if (vad.isRunning) return true

  store.setMicStatus('starting')
  try {
    await transcriber.start()
  } catch (err) {
    store.setMicStatus('error', err instanceof Error ? err.message : String(err))
    return false
  }

  const silenceMs = useLayoutStore.getState().voiceVadSilenceMs
  const ok = await vad.start(
    {
      onSpeechStart: () => useVoiceStore.getState().setMicStatus('hearing'),
      onVadMisfire: () => useVoiceStore.getState().setMicStatus('listening'),
      onError: (message) => useVoiceStore.getState().setMicStatus('error', message),
      onSpeechEnd: (pcm) => {
        void handleSpeechSegment(pcm)
      }
    },
    { silenceMs }
  )

  if (!ok) {
    store.setMicStatus('error', 'Could not start the microphone')
    return false
  }
  useVoiceStore.getState().setMicStatus('listening')
  return true
}

async function handleSpeechSegment(pcm: Float32Array): Promise<void> {
  const store = useVoiceStore.getState()
  store.setMicStatus('transcribing')
  const seconds = (pcm.length / 16000).toFixed(1)
  try {
    const { text, ms, device } = await transcriber.transcribe(pcm)
    if (!text.trim()) {
      // Surface this rather than dropping it silently — an empty transcript is
      // indistinguishable from "STT never ran" unless it is reported.
      store.push({
        transcript: `(${seconds}s of audio)`,
        outcome: `No speech recognised — ${ms}ms on ${device}`,
        ok: false,
        source: 'fallback'
      })
      store.setMicStatus('listening')
      return
    }
    store.setMicStatus('thinking')
    await submitUtterance(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.startsWith('Dropped:')) {
      store.push({
        transcript: `(${seconds}s of audio)`,
        outcome: `Transcription failed: ${message}`,
        ok: false,
        source: 'fallback'
      })
    }
  } finally {
    if (vad.isRunning) useVoiceStore.getState().setMicStatus('listening')
  }
}

export function stopListening(): void {
  // destroy(), not pause() — a live MediaStreamTrack keeps the macOS orange mic
  // indicator lit, which users reasonably read as the app still recording.
  vad.destroy()
  transcriber.stop()
  const store = useVoiceStore.getState()
  store.setMicStatus('off')
  store.setLevel(0)
}

export function isListening(): boolean {
  return vad.isRunning
}

const MODEL_CACHE_NAME = 'transformers-cache'

/**
 * Whether the whisper weights are already in the browser Cache API.
 * This is the cache transformers.js actually uses, so it is the honest answer to
 * "will using voice hit the network?" — the userData model manager is a separate,
 * currently-unused download path.
 */
export async function isModelCached(): Promise<boolean> {
  if (!('caches' in globalThis)) return false
  try {
    const cache = await caches.open(MODEL_CACHE_NAME)
    const keys = await cache.keys()
    return keys.some((r) => r.url.includes('whisper-base.en'))
  } catch {
    return false
  }
}

export async function clearModelCache(): Promise<void> {
  if (!('caches' in globalThis)) return
  try {
    await caches.delete(MODEL_CACHE_NAME)
  } catch {
    /* nothing cached */
  }
}

/**
 * Recover from the mic device disappearing (headphones unplugged, dock removed).
 * Without this the feature dies silently and looks like a bug in voice control.
 */
export function attachDeviceChangeRecovery(): () => void {
  const handler = async (): Promise<void> => {
    if (!vad.isRunning) return
    stopListening()
    const restarted = await startListening()
    if (!restarted) {
      useVoiceStore.getState().setMicStatus('error', 'Audio device changed — mic stopped')
    }
  }
  navigator.mediaDevices.addEventListener('devicechange', handler)
  return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
}

export async function submitUtterance(transcript: string): Promise<void> {
  const text = transcript.trim()
  if (!text) return

  const store = useVoiceStore.getState()

  const fast = matchFastPath(text)
  if (fast) {
    applyDispatch(fast, text, 'fast-path')
    return
  }

  if (store.status !== 'ready') {
    store.push({
      transcript: text,
      outcome: 'Voice agent is not ready and no fast-path matched',
      ok: false,
      source: 'fallback'
    })
    return
  }

  currentTranscript = text
  store.setAwaiting(true)

  // Single line: the PTY submits on every "\n", so a multi-line message would be
  // sent as several separate prompts and answered one by one.
  const snapshot = buildStateSnapshot().replace(/\n/g, ' | ')
  const message = `${snapshot} [request] ${text}`
  const sent = await window.api.voiceAgent.send(message)
  if (!sent) {
    store.setAwaiting(false)
    store.push({
      transcript: text,
      outcome: 'Could not reach the voice agent',
      ok: false,
      source: 'fallback'
    })
    return
  }

  await new Promise<void>((resolve) => {
    resolveTurn = resolve
    setTimeout(() => {
      if (!resolveTurn) return
      resolveTurn = null
      const s = useVoiceStore.getState()
      s.setAwaiting(false)
      const streak = s.unparseableStreak + 1
      useVoiceStore.setState({ unparseableStreak: streak })
      s.push({
        transcript: text,
        outcome:
          streak >= UNPARSEABLE_LIMIT
            ? 'No usable reply (agent looks degraded)'
            : 'No usable reply from the agent',
        ok: false,
        source: 'fallback'
      })
      resolve()
    }, 20000)
  })
}
