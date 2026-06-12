import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

const sendToTerminalMock = vi.fn()
vi.mock('@/lib/send-to-terminal', () => ({
  sendToTerminalViaPty: (...args: unknown[]) => sendToTerminalMock(...args)
}))

import { useQueueRunner } from './useQueueRunner'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'

const llmTab = (id: string, projectId: string) => ({
  id,
  title: id,
  projectId,
  cwd: '/p',
  initialCommand: 'claude'
})

const shellTab = (id: string, projectId: string) => ({
  id,
  title: id,
  projectId,
  cwd: '/p'
})

const setupRunnerState = (opts: {
  activeProjectId?: string
  tabs: ReturnType<typeof llmTab>[]
  activeTabPerProject?: Record<string, string>
  tabStatuses?: Record<string, 'idle' | 'busy'>
  itemsPerTab?: Record<string, { id: string; text: string }[]>
  autoRunPerTab?: Record<string, boolean>
}): void => {
  useProjectStore.setState({ activeProjectId: opts.activeProjectId ?? null } as never)
  useTerminalStore.setState({
    tabs: opts.tabs,
    activeTabPerProject: opts.activeTabPerProject ?? {},
    tabStatuses: opts.tabStatuses ?? {},
    setTabStatus: useTerminalStore.getState().setTabStatus
  } as never)
  useQueueStore.setState({
    itemsPerTab: opts.itemsPerTab ?? {},
    autoRunPerTab: opts.autoRunPerTab ?? {},
    dequeue: useQueueStore.getState().dequeue
  } as never)
}

const flushDispatch = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useQueueRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    sendToTerminalMock.mockReset()
    vi.mocked(window.api.terminal.has).mockImplementation(async () => true)
    useProjectStore.setState({ activeProjectId: null } as never)
    useTerminalStore.setState({
      tabs: [],
      activeTabPerProject: {},
      tabStatuses: {}
    } as never)
    useQueueStore.setState({
      itemsPerTab: {},
      autoRunPerTab: {}
    } as never)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('does nothing when no project is active', async () => {
    setupRunnerState({
      tabs: [llmTab('t1', 'p1')],
      itemsPerTab: { t1: [{ id: 'q1', text: 'hello' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).not.toHaveBeenCalled()
  })

  it('does nothing when the active tab is not an LLM tab', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [shellTab('shell-1', 'p1') as never],
      activeTabPerProject: { p1: 'shell-1' },
      itemsPerTab: { 'shell-1': [{ id: 'q1', text: 'hello' }] },
      autoRunPerTab: { 'shell-1': true },
      tabStatuses: { 'shell-1': 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).not.toHaveBeenCalled()
  })

  it('does nothing when autoRun is disabled', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'hello' }] },
      autoRunPerTab: { t1: false },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).not.toHaveBeenCalled()
  })

  it('auto-runs by default for a tab with no explicit autoRun preference', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'hello' }] },
      autoRunPerTab: {},
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).toHaveBeenCalledWith('t1', 'hello')
  })

  it('does nothing when the tab is busy', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'hello' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'busy' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).not.toHaveBeenCalled()
  })

  it('does nothing when the queue is empty', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).not.toHaveBeenCalled()
  })

  it('dispatches the head item when conditions align: idle, autoRun, items present', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'first' }, { id: 'q2', text: 'second' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).toHaveBeenCalledWith('t1', 'first')
    expect(useTerminalStore.getState().tabStatuses.t1).toBe('busy')
    expect(useQueueStore.getState().itemsPerTab.t1.map((i) => i.id)).toEqual(['q2'])
  })

  it('does not dispatch a second item before the 2s cooldown elapses', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'first' }, { id: 'q2', text: 'second' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).toHaveBeenCalledTimes(1)

    act(() => {
      useTerminalStore.getState().setTabStatus('t1', 'idle')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(sendToTerminalMock).toHaveBeenCalledTimes(1)
  })

  it('dispatches the next item once the 2s cooldown has elapsed', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'first' }, { id: 'q2', text: 'second' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
      useTerminalStore.getState().setTabStatus('t1', 'idle')
    })
    await flushDispatch()

    expect(sendToTerminalMock).toHaveBeenCalledTimes(2)
    expect(sendToTerminalMock).toHaveBeenLastCalledWith('t1', 'second')
  })

  it('retries by itself once the cooldown elapses, without another state change', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'first' }, { id: 'q2', text: 'second' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).toHaveBeenCalledTimes(1)

    act(() => {
      useTerminalStore.getState().setTabStatus('t1', 'idle')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(sendToTerminalMock).toHaveBeenCalledTimes(2)
    expect(sendToTerminalMock).toHaveBeenLastCalledWith('t1', 'second')
  })

  it('does not throttle one tab because another tab dispatched recently', async () => {
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1'), llmTab('t2', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: {
        t1: [{ id: 'q1', text: 'for t1' }],
        t2: [{ id: 'q2', text: 'for t2' }]
      },
      autoRunPerTab: { t1: true, t2: true },
      tabStatuses: { t1: 'idle', t2: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()
    expect(sendToTerminalMock).toHaveBeenCalledWith('t1', 'for t1')

    act(() => {
      useTerminalStore.setState({
        activeTabPerProject: { p1: 't2' }
      } as never)
    })
    await flushDispatch()

    expect(sendToTerminalMock).toHaveBeenCalledWith('t2', 'for t2')
  })

  it('keeps the item queued when the tab has no live PTY', async () => {
    vi.mocked(window.api.terminal.has).mockImplementation(async () => false)
    setupRunnerState({
      activeProjectId: 'p1',
      tabs: [llmTab('t1', 'p1')],
      activeTabPerProject: { p1: 't1' },
      itemsPerTab: { t1: [{ id: 'q1', text: 'hello' }] },
      autoRunPerTab: { t1: true },
      tabStatuses: { t1: 'idle' }
    })
    renderHook(() => useQueueRunner())
    await flushDispatch()

    expect(sendToTerminalMock).not.toHaveBeenCalled()
    expect(useQueueStore.getState().itemsPerTab.t1.map((i) => i.id)).toEqual(['q1'])
    expect(useTerminalStore.getState().tabStatuses.t1).toBe('idle')
  })
})
