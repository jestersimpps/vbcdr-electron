import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advanceAndHandOff,
  applyStageOutput,
  discardTicket,
  handOffStage,
  rerunStage,
  resumeStage,
  sendAttachmentsToAgent
} from './sdlc-handover'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'
import type { Project } from '@/models/types'

vi.mock('@/components/terminal/TerminalInstance', () => ({
  disposeTerminal: vi.fn(),
  getTerminalInstance: vi.fn(() => undefined)
}))

const project: Project = { id: 'p1', name: 'vbcdr', path: '/cwd', lastOpened: 0 }

function ticket(overrides: Partial<SdlcTicket> = {}): SdlcTicket {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Add auth',
    description: 'Add auth\nUsers need to log in',
    stage: 'planning',
    status: 'idle',
    branch: 'llm/add-auth',
    worktreePath: '—',
    worktreeId: null,
    tabId: null,
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
    blockedReason: null,
    ...overrides
  }
}

function current(): SdlcTicket {
  return useSdlcStore.getState().tickets[0]
}

beforeEach(() => {
  useSdlcStore.setState({ tickets: [ticket()], selectedTicketId: null, stageModels: {} })
  useProjectStore.setState({ projects: [project], activeProjectId: null })
  useTerminalStore.setState({ tabs: [], activeTabPerProject: {}, tabStatuses: {} })
  useQueueStore.setState({ itemsPerTab: {} })
  useWorktreeStore.setState({ worktreesPerProject: {} })
  vi.mocked(window.api.git.isRepo).mockResolvedValue(true)
  vi.mocked(window.api.fs.readFile).mockResolvedValue({ content: '', isBinary: false })
  vi.mocked(window.api.fs.deleteFile).mockClear()
  vi.mocked(window.api.git.ensureInfoExclude).mockClear()
})

describe('handOffStage', () => {
  it('creates a worktree, a fresh tab and queues the interpolated prompt', async () => {
    const result = await handOffStage(current(), project)
    expect(result).not.toBeNull()

    const tabs = useTerminalStore.getState().tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0].cwd).toBe('/cwd/.worktrees/llm/x')
    expect(tabs[0].title).toBe('Planning · Add auth')

    const queued = useQueueStore.getState().itemsPerTab[tabs[0].id]
    expect(queued).toHaveLength(1)
    expect(queued[0].text).toContain('/cwd/.worktrees/llm/x')
    expect(queued[0].text).toContain('Add auth')
    expect(queued[0].text).not.toContain('{{')

    const updated = current()
    expect(updated.status).toBe('running')
    expect(updated.tabId).toBe(tabs[0].id)
    expect(updated.worktreeId).toBe('wt1')
  })

  it('renames the auto-named branch to the ticket slug', async () => {
    await handOffStage(current(), project)
    expect(window.api.worktrees.renameBranch).toHaveBeenCalledWith('wt1', 'llm/add-auth')
    expect(current().branch).toBe('llm/add-auth')
  })

  it('activates the new tab for the queue without navigating away from the SDLC board', async () => {
    await handOffStage(current(), project)
    const tabId = current().tabId
    expect(useTerminalStore.getState().activeTabPerProject['p1']).toBe(tabId)
  })

  it('clears a stale sentinel and excludes it from git before the agent starts', async () => {
    await handOffStage(current(), project)
    expect(window.api.fs.deleteFile).toHaveBeenCalledWith('/cwd/.worktrees/llm/x/.vbcdr/stage-output.md')
    expect(window.api.git.ensureInfoExclude).toHaveBeenCalledWith('/cwd', '.vbcdr/')
  })

  it('fails the ticket instead of running in the project folder when it is not a git repo', async () => {
    vi.mocked(window.api.git.isRepo).mockResolvedValue(false)
    const result = await handOffStage(current(), project)
    expect(result).toBeNull()
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    expect(current().status).toBe('failed')
  })

  it('fails the ticket but keeps the worktree when the handoff throws after creating it', async () => {
    vi.mocked(window.api.git.ensureInfoExclude).mockRejectedValueOnce(new Error('No handler registered'))
    const result = await handOffStage(current(), project)
    expect(result).toBeNull()
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    const updated = current()
    expect(updated.status).toBe('failed')
    expect(updated.blockedReason).toContain('No handler registered')
    expect(updated.worktreeId).toBe('wt1')
    expect(updated.tabId).toBeNull()
  })

  it('never hands off a done ticket', async () => {
    useSdlcStore.setState({ tickets: [ticket({ stage: 'done' })] })
    expect(await handOffStage(current(), project)).toBeNull()
  })
})

describe('advanceAndHandOff', () => {
  it('closes the finished tab, moves the ticket on and opens the next stage in a new tab', async () => {
    await handOffStage(current(), project)
    const firstTab = current().tabId
    vi.mocked(window.api.fs.readFile).mockResolvedValue({ content: '1. add a login form\n2. wire the session', isBinary: false })

    await advanceAndHandOff('t1')

    const updated = current()
    expect(updated.stage).toBe('implementing')
    expect(updated.artifacts.plan).toBe('1. add a login form\n2. wire the session')
    expect(window.api.fs.writeFile).toHaveBeenCalledWith(
      '/cwd/.worktrees/llm/x/.vbcdr/plan.md',
      '1. add a login form\n2. wire the session'
    )
    expect(updated.tabId).not.toBe(firstTab)
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([updated.tabId])
    expect(window.api.terminal.kill).toHaveBeenCalledWith(firstTab)

    const prompt = useQueueStore.getState().itemsPerTab[updated.tabId!][0].text
    expect(prompt).toContain('1. add a login form')
  })

  it('starts planning straight from the backlog: the first agent touch creates the worktree', async () => {
    useSdlcStore.setState({ tickets: [ticket({ stage: 'backlog' })] })

    await advanceAndHandOff('t1')

    expect(current().stage).toBe('planning')
    expect(current().status).toBe('running')
    expect(current().worktreeId).toBe('wt1')
    expect(window.api.worktrees.renameBranch).toHaveBeenCalledWith('wt1', 'llm/add-auth')
    expect(useTerminalStore.getState().tabs[0].title).toBe('Planning · Add auth')
  })

  it('does not chain past review: done is reached through the wrap-up flow', async () => {
    useSdlcStore.setState({ tickets: [ticket({ stage: 'review' })] })
    await advanceAndHandOff('t1')
    expect(current().stage).toBe('review')
  })
})

describe('stage model', () => {
  it('starts the CLI with the picked model', async () => {
    useSdlcStore.getState().setStageAssignment('planning', 'anthropic', 'claude-sonnet-5')
    await handOffStage(current(), project)
    expect(useTerminalStore.getState().tabs[0].initialCommand).toBe(
      'claude --permission-mode bypassPermissions --model claude-sonnet-5'
    )
  })

  it('maps an OpenAI pick to the codex CLI', async () => {
    useSdlcStore.getState().setStageAssignment('planning', 'openai', 'gpt-5')
    await handOffStage(current(), project)
    const tab = useTerminalStore.getState().tabs[0]
    expect(tab.initialCommand).toBe('codex --model gpt-5')
    expect(tab.providerId).toBe('codex')
  })

  it('runs the default profile when nothing is picked for the stage', async () => {
    await handOffStage(current(), project)
    expect(useTerminalStore.getState().tabs[0].initialCommand).toBe(
      'claude --permission-mode bypassPermissions'
    )
  })
})

describe('unattended permissions', () => {
  it('bypasses permission prompts, since each stage runs in a throwaway worktree', async () => {
    useSdlcStore.getState().setStageAssignment('planning', 'anthropic', 'claude-sonnet-5')
    await handOffStage(current(), project)
    expect(useTerminalStore.getState().tabs[0].initialCommand).toContain(
      '--permission-mode bypassPermissions'
    )
  })

  it('does not pass the claude-only flag to codex', async () => {
    useSdlcStore.getState().setStageAssignment('planning', 'openai', 'gpt-5')
    await handOffStage(current(), project)
    expect(useTerminalStore.getState().tabs[0].initialCommand).not.toContain('--permission-mode')
  })
})

describe('resumeStage', () => {
  it('reopens the worktree with --continue and does not re-send the prompt', async () => {
    useSdlcStore.getState().setStageAssignment('planning', 'anthropic', 'claude-sonnet-5')
    await handOffStage(current(), project)
    useTerminalStore.getState().closeTab(current().tabId!)

    expect(await resumeStage('t1')).toBe(true)
    const tab = useTerminalStore.getState().tabs[0]
    expect(tab.initialCommand).toBe(
      'claude --continue --permission-mode bypassPermissions --model claude-sonnet-5'
    )
    expect(useQueueStore.getState().itemsPerTab[tab.id] ?? []).toHaveLength(0)
    expect(current().status).toBe('running')
    expect(current().tabId).toBe(tab.id)
  })

  it('refuses when the stage runs a CLI without session resume', async () => {
    useSdlcStore.getState().setStageAssignment('planning', 'openai', 'gpt-5')
    await handOffStage(current(), project)
    useTerminalStore.getState().closeTab(current().tabId!)
    expect(await resumeStage('t1')).toBe(false)
  })

  it('refuses for a ticket that never had a worktree', async () => {
    expect(await resumeStage('t1')).toBe(false)
  })
})

describe('attachments', () => {
  const shot = { id: 'a1', name: 'shot.png', kind: 'image' as const, dataUrl: 'data:image/png;base64,AAAA' }

  it('writes attachments into the worktree and tells the agent where they are', async () => {
    useSdlcStore.setState({ tickets: [ticket({ attachments: [shot] })] })
    await handOffStage(current(), project)
    expect(window.api.fs.writeDataUrl).toHaveBeenCalledWith('/cwd/.worktrees/llm/x/.vbcdr/attachments/shot.png', shot.dataUrl)
    const prompt = useQueueStore.getState().itemsPerTab[current().tabId!][0].text
    expect(prompt).toContain('.vbcdr/attachments/shot.png')
  })

  it('skips attachments whose bytes were never captured', async () => {
    useSdlcStore.setState({ tickets: [ticket({ attachments: [{ ...shot, dataUrl: null }] })] })
    vi.mocked(window.api.fs.writeDataUrl).mockClear()
    await handOffStage(current(), project)
    expect(window.api.fs.writeDataUrl).not.toHaveBeenCalled()
    expect(useQueueStore.getState().itemsPerTab[current().tabId!][0].text).not.toContain('Attachments')
  })

  it('sends late attachments to a live agent and logs it', async () => {
    await handOffStage(current(), project)
    expect(await sendAttachmentsToAgent(current(), [shot])).toBe(true)
    expect(window.api.fs.writeDataUrl).toHaveBeenCalledWith('/cwd/.worktrees/llm/x/.vbcdr/attachments/shot.png', shot.dataUrl)
    expect(current().artifacts.activity.at(-1)?.text).toContain('1 attachment')
  })

  it('does nothing when there is no live agent tab', async () => {
    expect(await sendAttachmentsToAgent(current(), [shot])).toBe(false)
  })
})

describe('agent tab titles', () => {
  it('renames the ticket from the agent title and keeps the stage prefix on the tab', async () => {
    await handOffStage(current(), project)
    const tabId = current().tabId!
    useTerminalStore.getState().setTabTitle(tabId, 'SDLC flow bug review implementation plan')
    expect(current().title).toBe('SDLC flow bug review implementation plan')
    expect(useTerminalStore.getState().tabs[0].title).toBe('Planning · SDLC flow bug review implementation plan')
  })

  it('ignores the CLI product name and the default tab title', async () => {
    await handOffStage(current(), project)
    const tabId = current().tabId!
    useTerminalStore.getState().setTabTitle(tabId, 'Claude Code')
    useTerminalStore.getState().setTabTitle(tabId, 'LLM')
    expect(current().title).toBe('Add auth')
    expect(useTerminalStore.getState().tabs[0].title).toBe('LLM')
  })

  it('strips the agent status glyph from the ticket title but keeps it on the tab', async () => {
    await handOffStage(current(), project)
    const tabId = current().tabId!
    useTerminalStore.getState().setTabTitle(tabId, '✳ Add scoreboard to snake game')
    expect(current().title).toBe('Add scoreboard to snake game')
    expect(useTerminalStore.getState().tabs[0].title).toBe('Planning · ✳ Add scoreboard to snake game')
  })

  it('still ignores the CLI product name when it arrives glyph-prefixed', async () => {
    await handOffStage(current(), project)
    const tabId = current().tabId!
    useTerminalStore.getState().setTabTitle(tabId, '◐ Claude Code')
    expect(current().title).toBe('Add auth')
  })

  it('ignores the shell prompt the shell reasserts when the agent exits', async () => {
    await handOffStage(current(), project)
    const tabId = current().tabId!
    useTerminalStore.getState().setTabTitle(tabId, 'jovinkenroye@MacBook-Air-24:~/Sites/x/.worktrees/llm/y')
    useTerminalStore.getState().setTabTitle(tabId, '~/Sites/x')
    expect(current().title).toBe('Add auth')
  })

  it('leaves tickets alone for tabs the board does not own', () => {
    const tabId = useTerminalStore.getState().createTab('p1', '/cwd', 'claude')
    useTerminalStore.getState().setTabTitle(tabId, 'Some manual work')
    expect(current().title).toBe('Add auth')
  })
})

describe('rerunStage', () => {
  it('replaces the running tab with a fresh one for the same stage', async () => {
    await handOffStage(current(), project)
    const firstTab = current().tabId
    await rerunStage('t1')
    expect(current().stage).toBe('planning')
    expect(current().tabId).not.toBe(firstTab)
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
  })
})

describe('discardTicket', () => {
  it('removes the worktree, its tab and the ticket', async () => {
    await handOffStage(current(), project)
    vi.mocked(window.api.worktrees.remove).mockClear()

    await discardTicket('t1')

    expect(window.api.worktrees.remove).toHaveBeenCalledWith('wt1')
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })

  it('deletes a ticket that never had a worktree without touching git', async () => {
    vi.mocked(window.api.worktrees.remove).mockClear()
    await discardTicket('t1')
    expect(window.api.worktrees.remove).not.toHaveBeenCalled()
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })
})

describe('applyStageOutput', () => {
  it('keeps the planning output whole as the plan document', () => {
    const patch = applyStageOutput(ticket({ stage: 'planning' }), '# Plan\n\n1. do it')
    expect(patch.artifacts?.plan).toBe('# Plan\n\n1. do it')
  })

  it('leaves a backlog ticket untouched: there is no agent output to apply', () => {
    expect(applyStageOutput(ticket({ stage: 'backlog' }), 'anything')).toEqual({})
  })

  it('stores review output as the PR summary', () => {
    const patch = applyStageOutput(ticket({ stage: 'review' }), 'Looks good')
    expect(patch.artifacts?.prSummary).toBe('Looks good')
  })
})
