import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advanceAndHandOff,
  applyStageOutput,
  discardTicket,
  handOffStage,
  moveTicketOn,
  pendingDoneTicketIds,
  removeFinishedTicket,
  rerunStage,
  runDoneAction,
  runDoneActions
} from './sdlc-handover'
import { useSdlcStore } from '@/stores/sdlc-store'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useProjectStore } from '@/stores/project-store'
import { defaultLlmTab, useTerminalStore } from '@/stores/terminal-store'
import { useQueueStore } from '@/stores/queue-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'
import type { Project, TrackedWorktree } from '@/models/types'
import { threeStageFlow } from '@/models/sdlc-flow.fixtures'

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
    prState: 'none',
    blockedReason: null,
    doneActionAt: null,
    ...overrides
  }
}

function trackedWorktree(overrides: Partial<TrackedWorktree> = {}): TrackedWorktree {
  return {
    id: 'wt1',
    projectId: 'p1',
    projectPath: '/cwd',
    path: '/cwd/.worktrees/llm/x',
    branch: 'llm/add-auth',
    label: null,
    createdAt: 0,
    prUrl: null,
    prState: 'none',
    hasChanges: false,
    conflictPaths: [],
    lastCheckedAt: null,
    ...overrides
  }
}

function current(): SdlcTicket {
  return useSdlcStore.getState().tickets[0]
}

beforeEach(() => {
  useSdlcFlowStore.setState({ columns: threeStageFlow() })
  useSdlcStore.setState({ tickets: [ticket()] })
  useProjectStore.setState({ projects: [project], activeProjectId: null })
  useTerminalStore.setState({ tabs: [], activeTabPerProject: {}, tabStatuses: {} })
  useQueueStore.setState({ itemsPerTab: {} })
  useWorktreeStore.setState({ worktreesPerProject: {} })
  vi.mocked(window.api.git.isRepo).mockResolvedValue(true)
  vi.mocked(window.api.worktrees.refresh).mockResolvedValue(null)
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
    expect(updated.artifacts.outputs.planning).toBe('1. add a login form\n2. wire the session')
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

describe('startup command', () => {
  it('starts the default columns unattended, since each one runs in a throwaway worktree', async () => {
    await handOffStage(current(), project)
    expect(useTerminalStore.getState().tabs[0].initialCommand).toBe('claude --permission-mode bypassPermissions')
  })

  it("runs the column's command as typed and reads the provider from its first word", async () => {
    useSdlcFlowStore.getState().updateColumn('planning', { command: 'codex --model gpt-5' })
    await handOffStage(current(), project)
    const tab = useTerminalStore.getState().tabs[0]
    expect(tab.initialCommand).toBe('codex --model gpt-5')
    expect(tab.providerId).toBe('codex')
  })

  it('runs the default profile when the column has no command', async () => {
    useSdlcFlowStore.getState().updateColumn('planning', { command: '  ' })
    await handOffStage(current(), project)
    expect(useTerminalStore.getState().tabs[0].initialCommand).toBe(defaultLlmTab().command)
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

describe('default flow end to end', () => {
  it('takes a new ticket from backlog to done: worktree off the latest main, one agent per stage, work kept on its branch', async () => {
    useSdlcStore.setState({ tickets: [] })
    vi.mocked(window.api.worktrees.create).mockClear()
    vi.mocked(window.api.worktrees.finish).mockClear()
    vi.mocked(window.api.worktrees.remove).mockClear()
    vi.mocked(window.api.worktrees.create).mockResolvedValueOnce(
      trackedWorktree({ base: { ref: 'main', syncError: null } })
    )
    vi.mocked(window.api.worktrees.refresh).mockImplementation(async () => trackedWorktree({ branch: current().branch }))

    const created = useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'Add auth', attachments: [] })
    expect(current()).toMatchObject({ stage: 'backlog', worktreeId: null, tabId: null })

    const stages: string[] = []
    for (const stage of ['planning', 'implementing', 'review']) {
      await moveTicketOn(created.id)
      expect(current()).toMatchObject({ stage, status: 'running', worktreeId: 'wt1' })
      expect(useTerminalStore.getState().tabs).toHaveLength(1)
      expect(useTerminalStore.getState().tabs[0].cwd).toBe('/cwd/.worktrees/llm/x')
      stages.push(current().stage)
      vi.mocked(window.api.fs.readFile).mockResolvedValue({ content: `${stage} result`, isBinary: false })
    }

    await moveTicketOn(created.id)

    expect(stages).toEqual(['planning', 'implementing', 'review'])
    expect(current()).toMatchObject({ stage: 'done', tabId: null, status: 'idle' })
    expect(current().artifacts.outputs).toEqual({
      planning: 'planning result',
      implementing: 'implementing result',
      review: 'review result'
    })
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    expect(window.api.worktrees.create).toHaveBeenCalledTimes(1)
    expect(window.api.worktrees.create).toHaveBeenCalledWith('p1', '/cwd', { fromLatestDefault: true })
    expect(window.api.worktrees.finish).toHaveBeenCalledWith('wt1', current().title)
    expect(window.api.worktrees.remove).not.toHaveBeenCalled()
    expect(current().artifacts.activity.map((a) => a.text)).toEqual([
      'Worktree created from the latest main',
      'Handed Planning to the agent',
      'Handed Implementing to the agent',
      'Handed Review to the agent',
      `Worktree removed, work kept on branch ${current().branch}`
    ])
  })
})

describe('ticket worktree', () => {
  beforeEach(() => {
    vi.mocked(window.api.worktrees.create).mockClear()
  })

  it('cuts the worktree from the latest default branch and records it on the ticket', async () => {
    vi.mocked(window.api.worktrees.create).mockResolvedValueOnce(
      trackedWorktree({ branch: 'llm/x', base: { ref: 'main', syncError: null } })
    )

    await handOffStage(current(), project)

    expect(window.api.worktrees.create).toHaveBeenCalledWith('p1', '/cwd', { fromLatestDefault: true })
    expect(current()).toMatchObject({ worktreeId: 'wt1', worktreePath: '/cwd/.worktrees/llm/x', branch: 'llm/add-auth' })
    expect(current().artifacts.activity[0].text).toBe('Worktree created from the latest main')
  })

  it('still creates the worktree when pulling failed, and says so', async () => {
    vi.mocked(window.api.worktrees.create).mockResolvedValueOnce(
      trackedWorktree({ base: { ref: 'main', syncError: 'fatal: unable to access\nmore' } })
    )
    await handOffStage(current(), project)
    expect(current().artifacts.activity[0].text).toBe(
      'Worktree created from local main, pulling failed: fatal: unable to access'
    )
  })

  it('removes the worktree again when the ticket was deleted meanwhile', async () => {
    vi.mocked(window.api.worktrees.remove).mockClear()
    const handing = handOffStage(current(), project)
    useSdlcStore.getState().deleteTicket('t1')
    expect(await handing).toBeNull()
    expect(window.api.worktrees.remove).toHaveBeenCalledWith('wt1')
  })
})

describe('finishTicket', () => {
  beforeEach(() => {
    useSdlcStore.setState({
      tickets: [ticket({ stage: 'review', worktreeId: 'wt1', worktreePath: '/cwd/.worktrees/llm/x' })]
    })
    vi.mocked(window.api.worktrees.refresh).mockResolvedValue(trackedWorktree())
    vi.mocked(window.api.worktrees.finish).mockClear()
    vi.mocked(window.api.worktrees.remove).mockClear()
  })

  it('keeps the work on the ticket branch and only removes the worktree', async () => {
    useSdlcStore.getState().patchTicket('t1', { title: 'Review auth changes' })
    await moveTicketOn('t1')
    expect(window.api.worktrees.finish).toHaveBeenCalledWith('wt1', 'Add auth')
    expect(window.api.worktrees.remove).not.toHaveBeenCalled()
    expect(current().stage).toBe('done')
    expect(current().artifacts.activity.at(-1)?.text).toBe('Worktree removed, work kept on branch llm/add-auth')
  })

  it('does not move a ticket whose work could not be kept', async () => {
    vi.mocked(window.api.worktrees.finish).mockResolvedValueOnce({ ok: false, output: '', error: 'commit failed' })
    await moveTicketOn('t1')
    expect(current().stage).toBe('review')
    expect(current()).toMatchObject({ status: 'blocked', blockedReason: expect.stringContaining('commit failed') })
  })

  it('finishes a ticket whose worktree is already gone', async () => {
    vi.mocked(window.api.worktrees.refresh).mockResolvedValue(null)
    await moveTicketOn('t1')
    expect(window.api.worktrees.finish).not.toHaveBeenCalled()
    expect(current().stage).toBe('done')
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
    expect(patch.artifacts?.outputs.planning).toBe('# Plan\n\n1. do it')
  })

  it('leaves a backlog ticket untouched: there is no agent output to apply', () => {
    expect(applyStageOutput(ticket({ stage: 'backlog' }), 'anything')).toEqual({})
  })

  it('stores review output under the review column', () => {
    const patch = applyStageOutput(ticket({ stage: 'review' }), 'Looks good')
    expect(patch.artifacts?.outputs.review).toBe('Looks good')
  })
})

describe('custom columns', () => {
  function addAudit(): string {
    const flow = useSdlcFlowStore.getState()
    const column = flow.addColumn('Security audit', 'review')
    flow.updateColumn(column.id, {
      prompt: 'Audit {{branch}} against the plan:\n{{output.planning}}\nChanges:\n{{output.implementing}}',
      outputFile: '.vbcdr/audit.md'
    })
    return column.id
  }

  it('hands a user-defined column its own prompt, fed by the columns before it', async () => {
    const audit = addAudit()
    useSdlcStore.setState({
      tickets: [
        ticket({ stage: audit, artifacts: { ...EMPTY_ARTIFACTS, outputs: { planning: 'the plan', implementing: 'the changes' } } })
      ]
    })

    await handOffStage(current(), project)

    const tab = useTerminalStore.getState().tabs[0]
    expect(tab.title).toBe('Security audit · Add auth')
    const prompt = useQueueStore.getState().itemsPerTab[tab.id][0].text
    expect(prompt).toContain('the plan')
    expect(prompt).toContain('the changes')
    expect(prompt).not.toContain('{{')
  })

  it('reads a column that has not produced anything as (none) rather than leaving the token', async () => {
    const audit = addAudit()
    useSdlcStore.setState({ tickets: [ticket({ stage: audit })] })
    await handOffStage(current(), project)
    const tab = useTerminalStore.getState().tabs[0]
    expect(useQueueStore.getState().itemsPerTab[tab.id][0].text).toContain('(none)')
  })

  it('only fetches the diff for a prompt that asks for it', async () => {
    vi.mocked(window.api.git.diffSummary).mockClear()
    await handOffStage(current(), project)
    expect(window.api.git.diffSummary).not.toHaveBeenCalled()

    useSdlcStore.setState({ tickets: [ticket({ stage: 'review' })] })
    await handOffStage(current(), project)
    expect(window.api.git.diffSummary).toHaveBeenCalled()
  })

  function reviewPrompt(prompt: string): void {
    useSdlcFlowStore.getState().updateColumn('review', { prompt })
    useSdlcStore.setState({ tickets: [ticket({ stage: 'review' })] })
  }

  function queuedPrompt(): string {
    const tab = useTerminalStore.getState().tabs[0]
    return useQueueStore.getState().itemsPerTab[tab.id][0].text
  }

  it('only asks gh for the pull request when the prompt reads it', async () => {
    vi.mocked(window.api.worktrees.refresh).mockClear()
    await handOffStage(current(), project)
    expect(window.api.worktrees.refresh).not.toHaveBeenCalled()
  })

  it('hands the prompt the branch pull request with its state', async () => {
    vi.mocked(window.api.worktrees.refresh).mockResolvedValue(
      trackedWorktree({ prUrl: 'https://github.com/o/r/pull/7', prState: 'open' })
    )
    reviewPrompt('PR: {{pr}}')
    await handOffStage(current(), project)
    expect(queuedPrompt()).toBe('PR: open: https://github.com/o/r/pull/7')
    expect(current()).toMatchObject({ prUrl: 'https://github.com/o/r/pull/7', prState: 'open' })
  })

  it('says plainly when the branch has no pull request yet', async () => {
    vi.mocked(window.api.worktrees.refresh).mockResolvedValue(trackedWorktree())
    reviewPrompt('PR: {{pr}}')
    await handOffStage(current(), project)
    expect(queuedPrompt()).toBe('PR: none, no pull request exists for this branch yet')
  })

  it('says so when gh could not check, instead of claiming there is no pull request', async () => {
    vi.mocked(window.api.worktrees.refresh).mockResolvedValue(trackedWorktree({ prState: 'unknown' }))
    reviewPrompt('PR: {{pr}}')
    await handOffStage(current(), project)
    expect(queuedPrompt()).toBe('PR: unknown, the GitHub CLI (gh) could not report on this branch')
  })

  it('stores the result under the column id and saves it where the column says', async () => {
    const audit = addAudit()
    useSdlcStore.setState({ tickets: [ticket({ stage: 'implementing' })] })
    await handOffStage(current(), project)
    vi.mocked(window.api.fs.readFile).mockResolvedValue({ content: 'wrote the code', isBinary: false })

    await advanceAndHandOff('t1')
    expect(current().stage).toBe(audit)
    expect(current().artifacts.outputs.implementing).toBe('wrote the code')

    vi.mocked(window.api.fs.readFile).mockResolvedValue({ content: 'no findings', isBinary: false })
    await advanceAndHandOff('t1')
    expect(current().stage).toBe('review')
    expect(current().artifacts.outputs[audit]).toBe('no findings')
    expect(window.api.fs.writeFile).toHaveBeenCalledWith('/cwd/.worktrees/llm/x/.vbcdr/audit.md', 'no findings')
  })

  it('moving on from the column before the terminal one finishes the ticket, whatever it is called', async () => {
    const audit = addAudit()
    useSdlcFlowStore.getState().removeColumn('review')
    useSdlcStore.setState({ tickets: [ticket({ stage: audit, worktreeId: 'wt1', worktreePath: '/cwd/.worktrees/llm/x' })] })

    vi.mocked(window.api.worktrees.refresh).mockResolvedValueOnce(trackedWorktree())

    await moveTicketOn('t1')

    expect(current().stage).toBe('done')
    expect(window.api.worktrees.finish).toHaveBeenCalledWith('wt1', 'Add auth')
  })
})

describe('done prompt', () => {
  const finished = (overrides: Partial<SdlcTicket> = {}): SdlcTicket =>
    ticket({ stage: 'done', branch: 'llm/add-auth', artifacts: { ...EMPTY_ARTIFACTS, outputs: { review: 'lgtm' } }, ...overrides })

  beforeEach(() => {
    vi.mocked(window.api.worktrees.create).mockClear()
    vi.mocked(window.api.worktrees.create).mockImplementation(async () => trackedWorktree({ path: '/cwd/.worktrees/llm/add-auth' }))
  })

  it("reopens the ticket's branch and sends the column's prompt with every variable filled in", async () => {
    useSdlcStore.setState({ tickets: [finished()] })
    vi.mocked(window.api.worktrees.refresh).mockResolvedValue(trackedWorktree({ path: '/cwd/.worktrees/llm/add-auth' }))

    expect(await runDoneAction('t1')).toBe(true)

    expect(window.api.worktrees.create).toHaveBeenCalledWith('p1', '/cwd', { existingBranch: 'llm/add-auth' })
    const tab = useTerminalStore.getState().tabs[0]
    expect(tab).toMatchObject({ cwd: '/cwd/.worktrees/llm/add-auth', title: 'Done · Add auth' })
    const prompt = useQueueStore.getState().itemsPerTab[tab.id][0].text
    expect(prompt).toContain('gh pr create')
    expect(prompt).toContain('llm/add-auth')
    expect(prompt).toContain('Pull request for this branch: none, no pull request exists for this branch yet')
    expect(prompt).not.toContain('{{')
    expect(prompt).not.toContain('stage-output.md')
    expect(current()).toMatchObject({ stage: 'done', status: 'idle', tabId: tab.id, worktreeId: 'wt1' })
    expect(current().doneActionAt).toBeGreaterThan(0)
  })

  it('does nothing for a ticket that is not finished', async () => {
    expect(await runDoneAction('t1')).toBe(false)
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
  })

  it('says so when the branch cannot be checked out again', async () => {
    useSdlcStore.setState({ tickets: [finished()] })
    vi.mocked(window.api.worktrees.create).mockRejectedValueOnce(new Error("invalid reference: llm/add-auth"))
    expect(await runDoneAction('t1')).toBe(false)
    expect(current().blockedReason).toContain('llm/add-auth')
  })

  it('opens the next tab only once the previous one has its prompt, since only the active tab is fed', async () => {
    useSdlcStore.setState({ tickets: [finished(), finished({ id: 't2', title: 'Add billing', branch: 'llm/billing' })] })

    const running = runDoneActions(['t1', 't2'])
    await vi.waitFor(() => expect(useTerminalStore.getState().tabs).toHaveLength(1))
    const first = useTerminalStore.getState().tabs[0].id
    await new Promise((r) => setTimeout(r, 20))
    expect(useTerminalStore.getState().tabs).toHaveLength(1)

    useQueueStore.getState().dequeue(first)
    await vi.waitFor(() => expect(useTerminalStore.getState().tabs).toHaveLength(2))
    useQueueStore.getState().dequeue(useTerminalStore.getState().tabs[1].id)
    await running

    expect(useSdlcStore.getState().tickets.every((t) => t.doneActionAt)).toBe(true)
  })

  it('lists only the finished tickets that have not had the prompt yet', () => {
    useSdlcStore.setState({
      tickets: [finished(), finished({ id: 't2', doneActionAt: 1 }), ticket({ id: 't3' }), finished({ id: 't4', projectId: 'p2' })]
    })
    expect(pendingDoneTicketIds('p1')).toEqual(['t1'])
  })

  it('removing a finished ticket cleans up a reopened worktree and keeps the branch', async () => {
    vi.mocked(window.api.worktrees.finish).mockClear()
    vi.mocked(window.api.worktrees.remove).mockClear()
    vi.mocked(window.api.worktrees.refresh).mockResolvedValueOnce(trackedWorktree())
    useSdlcStore.setState({ tickets: [finished({ worktreeId: 'wt1' })] })

    await removeFinishedTicket('t1')

    expect(window.api.worktrees.finish).toHaveBeenCalledWith('wt1', 'Add auth')
    expect(window.api.worktrees.remove).not.toHaveBeenCalled()
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })
  it('removing a finished ticket whose worktree is already gone just takes the card off', async () => {
    vi.mocked(window.api.worktrees.finish).mockClear()
    useSdlcStore.setState({ tickets: [finished({ worktreeId: 'gone' })] })

    await removeFinishedTicket('t1')

    expect(window.api.worktrees.finish).not.toHaveBeenCalled()
    expect(useSdlcStore.getState().tickets).toHaveLength(0)
  })
})
