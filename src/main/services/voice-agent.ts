import * as pty from 'node-pty'
import type { BrowserWindow } from 'electron'

const IS_WINDOWS = process.platform === 'win32'
const READY_QUIET_MS = 1200
const HANDSHAKE_TIMEOUT_MS = 30000

export type VoiceAgentStatus = 'stopped' | 'starting' | 'ready' | 'degraded'

interface VoiceAgentState {
  proc: pty.IPty | null
  status: VoiceAgentStatus
  quietTimer: NodeJS.Timeout | null
  handshakeTimer: NodeJS.Timeout | null
  preamble: string
  preambleSent: boolean
  window: BrowserWindow | null
}

const state: VoiceAgentState = {
  proc: null,
  status: 'stopped',
  quietTimer: null,
  handshakeTimer: null,
  preamble: '',
  preambleSent: false,
  window: null
}

function emit(channel: string, payload: unknown): void {
  const win = state.window
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function setStatus(status: VoiceAgentStatus, detail?: string): void {
  state.status = status
  emit('voice-agent:status', { status, detail })
}

function clearTimers(): void {
  if (state.quietTimer) {
    clearTimeout(state.quietTimer)
    state.quietTimer = null
  }
  if (state.handshakeTimer) {
    clearTimeout(state.handshakeTimer)
    state.handshakeTimer = null
  }
}

// Mirrors stripAnsi in lib/voice/agent-protocol.ts. Kept local because main cannot
// import renderer code; the CSI class must include private parameter bytes (<=>?)
// or kitty-keyboard sequences leave residue like "4;0m" behind.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;:<=>?]*[ -/]*[@-~]|\x1b[()][A-B0-9]|\x1b[@-Z\\-_]/g

function stripForHandshake(text: string): string {
  return text.replace(ANSI, '')
}

function sendPreamble(): void {
  if (state.preambleSent || !state.proc) return
  state.preambleSent = true
  // The preamble is deliberately a single line — every "\n" is a submit, so a
  // multi-line contract would be sent as N prompts and answered N times.
  state.proc.write(`${state.preamble}\r`)
  // Status stays 'starting' until the agent acknowledges. Marking it ready here
  // would let an utterance race ahead of the contract being in effect.
}

export function startVoiceAgent(
  win: BrowserWindow,
  cwd: string,
  command: string,
  preamble: string,
  readyPatternSource?: string
): void {
  stopVoiceAgent()

  const trimmed = command.trim()
  if (!trimmed) {
    state.window = win
    setStatus('degraded', 'No command configured for the voice agent provider.')
    return
  }

  state.window = win
  state.preamble = preamble
  state.preambleSent = false
  setStatus('starting')

  const readyPattern = readyPatternSource ? new RegExp(readyPatternSource) : null

  try {
    state.proc = IS_WINDOWS
      ? pty.spawn('cmd.exe', ['/c', trimmed], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd,
          env: { ...process.env } as Record<string, string>
        })
      : pty.spawn(process.env.SHELL || '/bin/zsh', ['-lc', trimmed], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd,
          env: { ...process.env } as Record<string, string>
        })
  } catch (err) {
    state.proc = null
    setStatus('degraded', `Could not start the voice agent: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  state.handshakeTimer = setTimeout(() => {
    if (state.status !== 'ready') {
      // The contract was never acknowledged. Go ready anyway rather than stranding
      // the feature — a wrong-shaped reply is dropped by the parser, and the local
      // fast-path still covers core navigation.
      setStatus('ready', 'The agent never acknowledged the contract; replies may be noisy.')
    }
  }, HANDSHAKE_TIMEOUT_MS)

  state.proc.onData((data) => {
    emit('voice-agent:data', data)

    if (!state.preambleSent) {
      if (readyPattern?.test(data)) {
        sendPreamble()
        return
      }
      if (state.quietTimer) clearTimeout(state.quietTimer)
      state.quietTimer = setTimeout(sendPreamble, READY_QUIET_MS)
      return
    }

    // Preamble sent: wait for the acknowledgement before accepting utterances, so
    // a request cannot race ahead of the contract taking effect.
    if (state.status !== 'ready' && /\bREADY\b/.test(stripForHandshake(data))) {
      if (state.handshakeTimer) {
        clearTimeout(state.handshakeTimer)
        state.handshakeTimer = null
      }
      setStatus('ready')
    }
  })

  state.proc.onExit(({ exitCode }) => {
    clearTimers()
    state.proc = null
    state.preambleSent = false
    setStatus('degraded', `The voice agent exited (code ${exitCode}).`)
  })
}

export function sendToVoiceAgent(text: string): boolean {
  if (!state.proc || state.status !== 'ready') return false
  state.proc.write(`${text}\r`)
  return true
}

export function voiceAgentStatus(): VoiceAgentStatus {
  return state.status
}

export function stopVoiceAgent(): void {
  clearTimers()
  if (state.proc) {
    try {
      state.proc.kill()
    } catch {
      /* process may already be gone */
    }
    state.proc = null
  }
  state.preambleSent = false
  if (state.status !== 'stopped') setStatus('stopped')
}
