import { EMPTY_ARTIFACTS, type SdlcDiffFile, type SdlcTicket } from '@/models/sdlc'

const DIFF_FILES: SdlcDiffFile[] = [
  {
    path: 'src/renderer/components/sdlc/TicketDetailModal.tsx',
    added: 42,
    removed: 18,
    hunks: [
      { kind: 'meta', text: '@@ -12,6 +12,7 @@' },
      { kind: 'context', text: "import { Modal } from '@/components/ui/Modal'" },
      { kind: 'add', text: "import { StageBody } from './StageBody'" },
      { kind: 'remove', text: "import { DiffList } from './DiffList'" },
      { kind: 'context', text: '' }
    ]
  },
  {
    path: 'src/renderer/stores/sdlc-store.ts',
    added: 9,
    removed: 2,
    hunks: [
      { kind: 'meta', text: '@@ -74,6 +74,7 @@' },
      { kind: 'context', text: '  createTicket: (input) => {' },
      { kind: 'add', text: '    const branch = branchNameFrom(description)' },
      { kind: 'context', text: '  }' }
    ]
  }
]

/** Dev-only fixture data — one ticket per stage, with realistic artifacts so every TicketDetailModal body has content. Never imported outside dev seeding. */
export function buildSeedTickets(projectId: string): SdlcTicket[] {
  const now = Date.now()
  const base: Omit<SdlcTicket, 'id' | 'stage' | 'title' | 'description' | 'status' | 'artifacts'> = {
    projectId,
    branch: '—',
    worktreePath: '—',
    worktreeId: null,
    tabId: null,
    agent: 'claude',
    createdAt: now - 1000 * 60 * 60 * 4,
    updatedAt: now - 1000 * 60 * 5,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    comments: [],
    prUrl: null,
    blockedReason: null,
    autoAdvance: false
  }

  return [
    {
      ...base,
      id: 'seed-backlog',
      stage: 'backlog',
      title: 'Persist terminal scrollback across worktree tab reopen',
      description:
        'Scrollback is lost when a worktree tab is closed and reopened. Should persist per-worktree so switching tickets does not lose agent output.',
      status: 'idle',
      artifacts: EMPTY_ARTIFACTS
    },
    {
      ...base,
      id: 'seed-planning',
      stage: 'planning',
      title: 'Add retry with backoff to worktree creation',
      description: 'git worktree add occasionally fails under disk contention on CI runners. Add a bounded retry.',
      status: 'awaiting-approval',
      branch: 'llm/worktree-retry-backoff',
      worktreePath: '/Users/dev/project/.worktrees/llm/worktree-retry-backoff',
      worktreeId: 'wt-seed-1',
      artifacts: {
        ...EMPTY_ARTIFACTS,
        outputs: {
          planning:
            '## Plan\n\n1. Wrap `git worktree add` in `git-service.ts` with a retry helper (3 attempts, exponential backoff starting at 250ms).\n2. Only retry on transient errors (lock file contention), not on `already exists` or auth failures.\n3. Add a unit test simulating two failures then a success.\n4. Log each retry attempt at debug level.'
        },
        activity: [{ at: now - 1000 * 60 * 12, text: 'Agent explored git-service.ts and worktree store' }]
      }
    },
    {
      ...base,
      id: 'seed-implementing',
      stage: 'implementing',
      title: 'Split TicketDetailModal into per-stage bodies',
      description: 'One 900-line modal branching on ticket.stage is hard to reason about. Split into stage-owned components.',
      status: 'awaiting-approval',
      branch: 'llm/split-ticket-modal',
      worktreePath: '/Users/dev/project/.worktrees/llm/split-ticket-modal',
      worktreeId: 'wt-seed-2',
      filesChanged: 8,
      linesAdded: 612,
      linesRemoved: 340,
      checks: [
        { name: 'typecheck', passed: true },
        { name: 'vitest', passed: true },
        { name: 'lint', passed: false }
      ],
      artifacts: {
        ...EMPTY_ARTIFACTS,
        outputs: {
          planning: '## Plan\n\nSplit into TicketStageParts, stages/*, TicketStageFooter, with a thin router.',
          implementing: 'lint: 2 warnings in TicketStageFooter.tsx (unused import)\ntypecheck: clean\nvitest: 26 passed'
        },
        diffFiles: DIFF_FILES,
        activity: [
          { at: now - 1000 * 60 * 40, text: 'Extracted TicketStageParts.tsx' },
          { at: now - 1000 * 60 * 10, text: 'Ran typecheck and tests' }
        ]
      },
      comments: [
        { id: 'c1', author: 'you', text: 'Looks good — can you also group the footer props?', at: now - 1000 * 60 * 8, sentBack: false }
      ]
    },
    {
      ...base,
      id: 'seed-review',
      stage: 'review',
      title: 'Add collapsible plan reference to implementing stage',
      description: 'Implementing had no link back to the approved plan, making it hard to check the diff against intent.',
      status: 'awaiting-approval',
      branch: 'llm/plan-reference-panel',
      worktreePath: '/Users/dev/project/.worktrees/llm/plan-reference-panel',
      worktreeId: 'wt-seed-3',
      filesChanged: 3,
      linesAdded: 58,
      linesRemoved: 4,
      checks: [
        { name: 'typecheck', passed: true },
        { name: 'vitest', passed: true }
      ],
      artifacts: {
        ...EMPTY_ARTIFACTS,
        outputs: {
          review:
            '## Summary\n\nAdds a collapsible `PlanReferencePanel` shown above checks/diff in the implementing stage body, so reviewers can compare the diff against the approved plan without leaving the modal.\n\n### Testing\n- `npx vitest run` — 1203 passed\n- `npx tsc --noEmit` — clean'
        },
        diffFiles: DIFF_FILES.slice(0, 1),
        activity: [{ at: now - 1000 * 60 * 3, text: 'Opened PR #482' }]
      },
      prUrl: 'https://github.com/example/vibecoder/pull/482'
    },
    {
      ...base,
      id: 'seed-done',
      stage: 'done',
      title: 'Fix xterm keydown/keypress double-fire on Enter',
      description: 'attachCustomKeyEventHandler fired for both keydown and keypress, sending Enter twice into the PTY.',
      status: 'idle',
      branch: 'llm/xterm-enter-double-fire',
      worktreePath: '—',
      filesChanged: 2,
      linesAdded: 14,
      linesRemoved: 3,
      checks: [
        { name: 'typecheck', passed: true },
        { name: 'vitest', passed: true }
      ],
      artifacts: {
        ...EMPTY_ARTIFACTS,
        diffFiles: DIFF_FILES.slice(1),
        activity: [
          { at: now - 1000 * 60 * 60 * 2, text: 'Opened PR #479' },
          { at: now - 1000 * 60 * 60, text: 'Merged and worktree removed' }
        ]
      },
      prUrl: 'https://github.com/example/vibecoder/pull/479'
    }
  ]
}
