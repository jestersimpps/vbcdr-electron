import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

const readSentinelMock = vi.fn<(worktreePath: string) => Promise<string | null>>()
vi.mock('@/lib/sdlc-sentinel', () => ({
  readSentinel: (p: string) => readSentinelMock(p)
}))

const recordStageOutputMock = vi.fn(async () => ({ artifacts: undefined }) as never)
const moveTicketOnMock = vi.fn(async () => undefined)
vi.mock('@/lib/sdlc-handover', () => ({
  recordStageOutput: (...a: unknown[]) => recordStageOutputMock(...(a as [])),
  moveTicketOn: (...a: unknown[]) => moveTicketOnMock(...(a as [])),
  applyStageOutput: () => ({})
}))

import { useSdlcStageWatcher } from './useSdlcStageWatcher'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { EMPTY_ARTIFACTS, type SdlcTicket, type SdlcTicketStatus } from '@/models/sdlc'

const TAB = 'tab-1'
const WT = '/repo/.worktrees/llm/x'

const ticket = (over: Partial<SdlcTicket> = {}): SdlcTicket => ({
  id: 't1',
  projectId: 'p1',
  title: 'Add a scoreboard',
  description: 'desc',
  stage: 'planning',
  status: 'running',
  branch: 'llm/x',
  worktreePath: WT,
  worktreeId: 'w1',
  tabId: TAB,
  agent: 'claude',
  createdAt: 0,
  updatedAt: 0,
  filesChanged: 0,
  linesAdded: 0,
  linesRemoved: 0,
  checks: [],
  attachments: [],
  comments: [],
  artifacts: EMPTY_ARTIFACTS,
  prUrl: null,
    prState: 'none',
  blockedReason: null,
  doneActionAt: null,
  ...over
})

const setup = (t: SdlcTicket, promptDetected = false): void => {
  useSdlcStore.setState({ tickets: [t] } as never)
  useTerminalStore.setState({
    tabs: [{ id: TAB, title: 'claude', projectId: 'p1', cwd: '/repo', initialCommand: 'claude' }],
    tabStatuses: { [TAB]: 'busy' },
    promptDetectedTabIds: promptDetected ? { [TAB]: true } : {}
  } as never)
}

const status = (): SdlcTicketStatus => useSdlcStore.getState().tickets[0].status

const tick = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(3000)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  readSentinelMock.mockReset().mockResolvedValue(null)
  recordStageOutputMock.mockClear()
  moveTicketOnMock.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useSdlcStageWatcher', () => {
  it('blocks a running ticket when its agent hits a prompt', async () => {
    setup(ticket(), true)
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('blocked')
    expect(useSdlcStore.getState().tickets[0].blockedReason).toMatch(/waiting on a prompt/)
  })

  it('recovers a blocked ticket once the sentinel appears', async () => {
    setup(
      ticket({
        status: 'blocked',
        blockedReason: 'The agent is waiting on a prompt in its terminal — open the tab to answer it.'
      }),
      true
    )
    readSentinelMock.mockResolvedValue('# Implementation Plan\n\nsteps')
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('awaiting-approval')
    expect(recordStageOutputMock).toHaveBeenCalled()
  })

  it('returns a blocked ticket to running once the prompt clears', async () => {
    setup(
      ticket({
        status: 'blocked',
        blockedReason: 'The agent is waiting on a prompt in its terminal — open the tab to answer it.'
      }),
      false
    )
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('running')
    expect(useSdlcStore.getState().tickets[0].blockedReason).toBeNull()
  })

  it('leaves a ticket blocked for a reason other than a prompt alone', async () => {
    setup(ticket({ status: 'blocked', blockedReason: 'The agent tab was closed before the stage finished.' }), false)
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('blocked')
  })

  it('does not decay a blocked ticket to failed via the never-busy timeout', async () => {
    setup(
      ticket({
        status: 'blocked',
        blockedReason: 'The agent is waiting on a prompt in its terminal — open the tab to answer it.'
      }),
      true
    )
    useTerminalStore.setState({ tabStatuses: { [TAB]: 'idle' } } as never)
    renderHook(() => useSdlcStageWatcher())
    for (let i = 0; i < 40; i++) await tick()
    expect(status()).toBe('blocked')
  })

  it('recovers a failed ticket once the sentinel appears', async () => {
    setup(ticket({ status: 'failed', blockedReason: 'The prompt never reached the agent. Check the terminal tab.' }))
    readSentinelMock.mockResolvedValue('# Review\n\nfindings')
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('awaiting-approval')
  })

  it('moves the ticket on as soon as the agent writes its result', async () => {
    setup(ticket())
    readSentinelMock.mockResolvedValue('# Plan')
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('awaiting-approval')
    expect(moveTicketOnMock).toHaveBeenCalledWith('t1')
  })

  it('does not move on a ticket whose agent is blocked on a prompt', async () => {
    setup(ticket(), true)
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('blocked')
    expect(moveTicketOnMock).not.toHaveBeenCalled()
  })

  it('only moves on once while the move is still in flight', async () => {
    setup(ticket())
    readSentinelMock.mockResolvedValue('# Plan')
    let release = (): void => {}
    moveTicketOnMock.mockImplementation(() => new Promise<undefined>((r) => { release = () => r(undefined) }))
    renderHook(() => useSdlcStageWatcher())
    await tick()
    await tick()
    await tick()
    expect(moveTicketOnMock).toHaveBeenCalledTimes(1)
    release()
  })

  it('completes a running stage from the sentinel', async () => {
    setup(ticket())
    readSentinelMock.mockResolvedValue('done')
    renderHook(() => useSdlcStageWatcher())
    await tick()
    expect(status()).toBe('awaiting-approval')
  })
})
