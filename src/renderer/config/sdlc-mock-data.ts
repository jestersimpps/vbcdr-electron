import { EMPTY_ARTIFACTS, type SdlcTicket } from '@/models/sdlc'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const now = Date.now()

export const SDLC_MOCK_AGENTS = ['claude', 'codex', 'gemini'] as const

export const SDLC_MOCK_PROJECTS = [
  { id: 'mock-vbcdr', name: 'vbcdr', path: '~/Sites/vibecoder' },
  { id: 'mock-latentpress', name: 'latentpress', path: '~/Sites/latentpress' },
  { id: 'mock-globalpetsitter', name: 'globalpetsitter', path: '~/Sites/globalpetsitter' }
] as const

export const SDLC_MOCK_TICKETS: SdlcTicket[] = [
  {
    id: 't-1',
    projectId: 'mock-vbcdr',
    title: 'Add SDLC board to left nav',
    description: 'New nav icon opening a swimlane board grouped by project.',
    stage: 'implementing',
    status: 'running',
    branch: 'llm/sdlc-board',
    worktreePath: '~/Sites/vibecoder/.worktrees/llm/sdlc-board',
    agent: 'claude',
    createdAt: now - 3 * HOUR,
    updatedAt: now - 4 * MINUTE,
    filesChanged: 7,
    linesAdded: 412,
    linesRemoved: 18,
    checks: [],
    attachments: [],
    artifacts: {
      plan: [
        'Add SdlcPage with one swimlane per project',
        'Wire a nav entry and page flag alongside the existing pages',
        'Model tickets, stages and per-stage artifacts'
      ],
      diffFiles: [
        {
        path: 'src/renderer/components/sdlc/SdlcPage.tsx',
        added: 198,
        removed: 0,
        hunks: [
          { kind: 'meta', text: '@@ -1,0 +1,198 @@' },
          { kind: 'add', text: '  // 198 lines added' }
        ]
      },
        {
        path: 'src/renderer/components/sdlc/NewTicketModal.tsx',
        added: 96,
        removed: 0,
        hunks: [
          { kind: 'meta', text: '@@ -1,0 +1,96 @@' },
          { kind: 'add', text: '  // 96 lines added' }
        ]
      },
        {
        path: 'src/renderer/stores/sdlc-store.ts',
        added: 74,
        removed: 0,
        hunks: [
          { kind: 'meta', text: '@@ -1,0 +1,74 @@' },
          { kind: 'add', text: '  // 74 lines added' }
        ]
      },
        {
        path: 'src/renderer/models/sdlc.ts',
        added: 41,
        removed: 0,
        hunks: [
          { kind: 'meta', text: '@@ -1,0 +1,41 @@' },
          { kind: 'add', text: '  // 41 lines added' }
        ]
      },
        {
        path: 'src/renderer/components/layout/AppLayoutGrid.tsx',
        added: 21,
        removed: 2,
        hunks: [
          { kind: 'meta', text: '@@ -1,2 +1,21 @@' },
          { kind: 'remove', text: '  // 2 lines replaced' },
          { kind: 'add', text: '  // 21 lines added' }
        ]
      },
        {
        path: 'src/renderer/stores/project-store.ts',
        added: 12,
        removed: 0,
        hunks: [
          { kind: 'meta', text: '@@ -1,0 +1,12 @@' },
          { kind: 'add', text: '  // 12 lines added' }
        ]
      },
        {
        path: 'src/renderer/config/sdlc-mock-data.ts',
        added: 170,
        removed: 16,
        hunks: [
          { kind: 'meta', text: '@@ -1,16 +1,170 @@' },
          { kind: 'remove', text: '  // 16 lines replaced' },
          { kind: 'add', text: '  // 170 lines added' }
        ]
      }
      ],
      checkOutput: null,
      prSummary: null,
      activity: [
        { at: now - 3 * HOUR, text: 'Created worktree llm/sdlc-board' },
        { at: now - 2 * HOUR, text: 'Plan approved, starting implementation' },
        { at: now - 22 * MINUTE, text: 'Wired the nav entry and page flag' },
        { at: now - 4 * MINUTE, text: 'Editing SdlcPage.tsx' }
      ]
    },
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-2',
    projectId: 'mock-vbcdr',
    title: 'Fix xterm Shift+Enter on Windows',
    description: 'CSI u encoding is dropped on the keypress event.',
    stage: 'implementing',
    status: 'running',
    branch: 'llm/xterm-shift-enter',
    worktreePath: '~/Sites/vibecoder/.worktrees/llm/xterm-shift-enter',
    agent: 'codex',
    createdAt: now - 6 * HOUR,
    updatedAt: now - 11 * MINUTE,
    filesChanged: 2,
    linesAdded: 34,
    linesRemoved: 9,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true },
      { name: 'tests', passed: false }
    ],
    attachments: [],
    artifacts: {
      plan: null,
      diffFiles: [
        {
        path: 'src/renderer/components/terminal/TerminalInstance.tsx',
        added: 28,
        removed: 7,
        hunks: [
          { kind: 'meta', text: '@@ -496,7 +496,12 @@ useEffect(() => {' },
          { kind: 'context', text: '    const onKey = (e: KeyboardEvent): boolean => {' },
          { kind: 'remove', text: "      if (e.key === 'Enter' && e.shiftKey) return false" },
          { kind: 'add', text: "      if (e.key === 'Enter' && e.shiftKey) {" },
          { kind: 'add', text: "        if (process.platform === 'win32') {" },
          { kind: 'add', text: '          term.input(CSI_U_SHIFT_ENTER)' },
          { kind: 'add', text: '          return false' },
          { kind: 'add', text: '        }' },
          { kind: 'add', text: '      }' },
          { kind: 'context', text: '      return true' },
          { kind: 'context', text: '    }' }
        ]
      },
        {
        path: 'src/renderer/lib/terminal-utils.ts',
        added: 6,
        removed: 2,
        hunks: [
          { kind: 'meta', text: '@@ -1,3 +1,7 @@' },
          { kind: 'add', text: "export const CSI_U_SHIFT_ENTER = '\\x1b[13;2u'" },
          { kind: 'add', text: '' },
          { kind: 'context', text: 'export function sendToTerminalViaKeyboardEvent(' },
          { kind: 'context', text: '  tabId: string,' }
        ]
      }
      ],
      checkOutput: [
        'FAIL  src/renderer/lib/terminal-utils.test.ts',
        '',
        '  × encodes Shift+Enter as CSI u on win32 (4 ms)',
        '',
        '    expected \'\\x1b[13;2u\' to be \'\\r\'',
        '',
        '    - Expected',
        '    + Received',
        '',
        '    - \\r',
        '    + \\x1b[13;2u',
        '',
        '      at terminal-utils.test.ts:118:34',
        '',
        ' Test Files  1 failed | 84 passed (85)',
        '      Tests  1 failed | 1056 passed (1057)'
      ].join('\n'),
      prSummary: null,
      activity: [
        { at: now - 6 * HOUR, text: 'Created worktree llm/xterm-shift-enter' },
        { at: now - 3 * HOUR, text: 'Implemented CSI u encoding behind a platform check' },
        { at: now - 11 * MINUTE, text: 'typecheck and lint passed, 1 test failing' }
      ]
    },
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-3',
    projectId: 'mock-vbcdr',
    title: 'Theme contrast pass on light variants',
    description: 'Twelve light themes leave -400 accents under 3:1 on white.',
    stage: 'review',
    status: 'awaiting-approval',
    branch: 'llm/light-theme-contrast',
    worktreePath: '~/Sites/vibecoder/.worktrees/llm/light-theme-contrast',
    agent: 'claude',
    createdAt: now - 26 * HOUR,
    updatedAt: now - 40 * MINUTE,
    filesChanged: 14,
    linesAdded: 96,
    linesRemoved: 96,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true },
      { name: 'tests', passed: true }
    ],
    attachments: [],
    artifacts: {
      plan: null,
      diffFiles: [
        {
        path: 'src/renderer/styles/themes/nord-light.css',
        added: 8,
        removed: 8,
        hunks: [
          { kind: 'meta', text: '@@ -12,12 +12,12 @@ :root' },
          { kind: 'remove', text: '  --accent: var(--nord-400);' },
          { kind: 'add', text: '  --accent: var(--nord-600);' },
          { kind: 'remove', text: '  --accent-hover: var(--nord-400);' },
          { kind: 'add', text: '  --accent-hover: var(--nord-600);' },
          { kind: 'remove', text: '  --link: var(--nord-400);' },
          { kind: 'add', text: '  --link: var(--nord-600);' },
          { kind: 'remove', text: '  --link-hover: var(--nord-400);' },
          { kind: 'add', text: '  --link-hover: var(--nord-600);' },
          { kind: 'remove', text: '  --focus-ring: var(--nord-400);' },
          { kind: 'add', text: '  --focus-ring: var(--nord-600);' },
          { kind: 'remove', text: '  --badge: var(--nord-400);' },
          { kind: 'add', text: '  --badge: var(--nord-600);' },
          { kind: 'remove', text: '  --chip: var(--nord-400);' },
          { kind: 'add', text: '  --chip: var(--nord-600);' },
          { kind: 'remove', text: '  --ring: var(--nord-400);' },
          { kind: 'add', text: '  --ring: var(--nord-600);' }
        ]
      },
        {
        path: 'src/renderer/styles/themes/solarized-light.css',
        added: 8,
        removed: 8,
        hunks: [
          { kind: 'meta', text: '@@ -12,12 +12,12 @@ :root' },
          { kind: 'remove', text: '  --accent: var(--solarized-400);' },
          { kind: 'add', text: '  --accent: var(--solarized-600);' },
          { kind: 'remove', text: '  --accent-hover: var(--solarized-400);' },
          { kind: 'add', text: '  --accent-hover: var(--solarized-600);' },
          { kind: 'remove', text: '  --link: var(--solarized-400);' },
          { kind: 'add', text: '  --link: var(--solarized-600);' },
          { kind: 'remove', text: '  --link-hover: var(--solarized-400);' },
          { kind: 'add', text: '  --link-hover: var(--solarized-600);' },
          { kind: 'remove', text: '  --focus-ring: var(--solarized-400);' },
          { kind: 'add', text: '  --focus-ring: var(--solarized-600);' },
          { kind: 'remove', text: '  --badge: var(--solarized-400);' },
          { kind: 'add', text: '  --badge: var(--solarized-600);' },
          { kind: 'remove', text: '  --chip: var(--solarized-400);' },
          { kind: 'add', text: '  --chip: var(--solarized-600);' },
          { kind: 'remove', text: '  --ring: var(--solarized-400);' },
          { kind: 'add', text: '  --ring: var(--solarized-600);' }
        ]
      },
        {
        path: 'src/renderer/styles/themes/github-light.css',
        added: 7,
        removed: 7,
        hunks: [
          { kind: 'meta', text: '@@ -12,11 +12,11 @@ :root' },
          { kind: 'remove', text: '  --accent: var(--github-400);' },
          { kind: 'add', text: '  --accent: var(--github-600);' },
          { kind: 'remove', text: '  --accent-hover: var(--github-400);' },
          { kind: 'add', text: '  --accent-hover: var(--github-600);' },
          { kind: 'remove', text: '  --link: var(--github-400);' },
          { kind: 'add', text: '  --link: var(--github-600);' },
          { kind: 'remove', text: '  --link-hover: var(--github-400);' },
          { kind: 'add', text: '  --link-hover: var(--github-600);' },
          { kind: 'remove', text: '  --focus-ring: var(--github-400);' },
          { kind: 'add', text: '  --focus-ring: var(--github-600);' },
          { kind: 'remove', text: '  --badge: var(--github-400);' },
          { kind: 'add', text: '  --badge: var(--github-600);' },
          { kind: 'remove', text: '  --chip: var(--github-400);' },
          { kind: 'add', text: '  --chip: var(--github-600);' }
        ]
      },
        {
        path: 'src/renderer/styles/themes/gruvbox-light.css',
        added: 7,
        removed: 7,
        hunks: [
          { kind: 'meta', text: '@@ -12,11 +12,11 @@ :root' },
          { kind: 'remove', text: '  --accent: var(--gruvbox-400);' },
          { kind: 'add', text: '  --accent: var(--gruvbox-600);' },
          { kind: 'remove', text: '  --accent-hover: var(--gruvbox-400);' },
          { kind: 'add', text: '  --accent-hover: var(--gruvbox-600);' },
          { kind: 'remove', text: '  --link: var(--gruvbox-400);' },
          { kind: 'add', text: '  --link: var(--gruvbox-600);' },
          { kind: 'remove', text: '  --link-hover: var(--gruvbox-400);' },
          { kind: 'add', text: '  --link-hover: var(--gruvbox-600);' },
          { kind: 'remove', text: '  --focus-ring: var(--gruvbox-400);' },
          { kind: 'add', text: '  --focus-ring: var(--gruvbox-600);' },
          { kind: 'remove', text: '  --badge: var(--gruvbox-400);' },
          { kind: 'add', text: '  --badge: var(--gruvbox-600);' },
          { kind: 'remove', text: '  --chip: var(--gruvbox-400);' },
          { kind: 'add', text: '  --chip: var(--gruvbox-600);' }
        ]
      },
        {
        path: 'src/renderer/styles/themes/tokyo-light.css',
        added: 6,
        removed: 6,
        hunks: [
          { kind: 'meta', text: '@@ -12,10 +12,10 @@ :root' },
          { kind: 'remove', text: '  --accent: var(--tokyo-400);' },
          { kind: 'add', text: '  --accent: var(--tokyo-600);' },
          { kind: 'remove', text: '  --accent-hover: var(--tokyo-400);' },
          { kind: 'add', text: '  --accent-hover: var(--tokyo-600);' },
          { kind: 'remove', text: '  --link: var(--tokyo-400);' },
          { kind: 'add', text: '  --link: var(--tokyo-600);' },
          { kind: 'remove', text: '  --link-hover: var(--tokyo-400);' },
          { kind: 'add', text: '  --link-hover: var(--tokyo-600);' },
          { kind: 'remove', text: '  --focus-ring: var(--tokyo-400);' },
          { kind: 'add', text: '  --focus-ring: var(--tokyo-600);' },
          { kind: 'remove', text: '  --badge: var(--tokyo-400);' },
          { kind: 'add', text: '  --badge: var(--tokyo-600);' }
        ]
      }
      ],
      checkOutput: null,
      prSummary: [
        'Raises accent contrast on 12 light themes that failed WCAG AA.',
        '',
        'Every -400 accent moved to its -600 equivalent, measured against the',
        'theme background rather than pure white. Lowest ratio is now 4.6:1,',
        'up from 1.5:1 on the worst theme (solarized-light).',
        '',
        'Dark variants are untouched. No token names changed, so nothing',
        'downstream needs updating.'
      ].join('\n'),
      activity: [
        { at: now - 26 * HOUR, text: 'Created worktree llm/light-theme-contrast' },
        { at: now - 20 * HOUR, text: 'Measured contrast across all 18 light themes' },
        { at: now - 4 * HOUR, text: 'All checks green' },
        { at: now - 40 * MINUTE, text: 'Opened PR #241, waiting for review' }
      ]
    },
    prUrl: 'https://github.com/jestersimpps/vbcdr-electron/pull/241',
    comments: [],
    blockedReason: null
  },
  {
    id: 't-4',
    projectId: 'mock-vbcdr',
    title: 'Persist terminal scrollback per worktree',
    description: 'Scrollback is lost when a worktree tab is reopened.',
    stage: 'backlog',
    status: 'idle',
    branch: '—',
    worktreePath: '—',
    agent: 'claude',
    createdAt: now - 2 * HOUR,
    updatedAt: now - 2 * HOUR,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-5',
    projectId: 'mock-latentpress',
    title: 'Book review ratings endpoint',
    description: 'Expose reviews:byBook through the public API.',
    stage: 'planning',
    status: 'running',
    branch: 'llm/reviews-endpoint',
    worktreePath: '~/Sites/latentpress/.worktrees/llm/reviews-endpoint',
    agent: 'claude',
    createdAt: now - 50 * MINUTE,
    updatedAt: now - 3 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: {
      plan: [
        'Read convex/reviews.ts and the existing books:getForAgent query',
        'Add a reviews:byBook query returning rating, body and author handle',
        'Expose it through /api/books/:slug/reviews with pagination',
        'Update openapi.json and bump the skill version',
        'Add tests covering an empty result and a paginated second page'
      ],
      diffFiles: [],
      checkOutput: null,
      prSummary: null,
      activity: [
        { at: now - 50 * MINUTE, text: 'Created worktree llm/reviews-endpoint' },
        { at: now - 44 * MINUTE, text: 'Read 18 files across convex/ and app/api/' },
        { at: now - 3 * MINUTE, text: 'Drafted a 5-step plan, waiting for approval' }
      ]
    },
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-6',
    projectId: 'mock-latentpress',
    title: 'Migrate agents table to new schema',
    description: 'Rename agent.slug to agent.handle across Convex functions.',
    stage: 'implementing',
    status: 'blocked',
    branch: 'llm/agents-schema',
    worktreePath: '~/Sites/latentpress/.worktrees/llm/agents-schema',
    agent: 'gemini',
    createdAt: now - 9 * HOUR,
    updatedAt: now - 55 * MINUTE,
    filesChanged: 5,
    linesAdded: 120,
    linesRemoved: 87,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: 'Schema rename drops data — needs your call before continuing'
  },
  {
    id: 't-7',
    projectId: 'mock-latentpress',
    title: 'OpenAPI spec version bump',
    description: 'Skill bundle reports 1.23.0, spec still says 1.22.0.',
    stage: 'done',
    status: 'idle',
    branch: 'llm/openapi-bump',
    worktreePath: '—',
    agent: 'codex',
    createdAt: now - 31 * HOUR,
    updatedAt: now - 5 * HOUR,
    filesChanged: 1,
    linesAdded: 3,
    linesRemoved: 3,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true },
      { name: 'tests', passed: true }
    ],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: 'https://github.com/jestersimpps/latentpress/pull/88',
    comments: [],
    blockedReason: null
  },
  {
    id: 't-8',
    projectId: 'mock-globalpetsitter',
    title: 'Sitter search facet counts',
    description: 'Facet counts drift when a filter is applied twice.',
    stage: 'implementing',
    status: 'failed',
    branch: 'llm/search-facets',
    worktreePath: '~/Sites/globalpetsitter/.worktrees/llm/search-facets',
    agent: 'claude',
    createdAt: now - 4 * HOUR,
    updatedAt: now - 18 * MINUTE,
    filesChanged: 6,
    linesAdded: 211,
    linesRemoved: 44,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: false },
      { name: 'tests', passed: false }
    ],
    attachments: [
      { id: 'a-1', name: 'facet-drift.png', kind: 'image', dataUrl: null },
      { id: 'a-2', name: 'search-params.json', kind: 'file', dataUrl: null }
    ],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-9',
    projectId: 'mock-globalpetsitter',
    title: 'Locale redirect loop on apex domain',
    description: 'Apex to www redirect fires twice for /nl paths.',
    stage: 'review',
    status: 'awaiting-approval',
    branch: 'llm/locale-redirect',
    worktreePath: '~/Sites/globalpetsitter/.worktrees/llm/locale-redirect',
    agent: 'codex',
    createdAt: now - 20 * HOUR,
    updatedAt: now - 2 * HOUR,
    filesChanged: 3,
    linesAdded: 41,
    linesRemoved: 29,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true },
      { name: 'tests', passed: true }
    ],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: 'https://github.com/jestersimpps/globalpetsitter/pull/512',
    comments: [],
    blockedReason: null
  },
  {
    id: 't-10',
    projectId: 'mock-globalpetsitter',
    title: 'Rate limit the signup endpoint',
    description: 'Scanners hit /signup from the bare IP a few thousand times a day.',
    stage: 'backlog',
    status: 'idle',
    branch: '—',
    worktreePath: '—',
    agent: 'claude',
    createdAt: now - 45 * MINUTE,
    updatedAt: now - 45 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-11',
    projectId: 'mock-vbcdr',
    title: 'Worktree cleanup on merged PRs',
    description: 'Prune worktrees whose PR is merged or closed.',
    stage: 'implementing',
    status: 'running',
    branch: 'llm/worktree-cleanup',
    worktreePath: '~/Sites/vibecoder/.worktrees/llm/worktree-cleanup',
    agent: 'codex',
    createdAt: now - 80 * MINUTE,
    updatedAt: now - 2 * MINUTE,
    filesChanged: 3,
    linesAdded: 88,
    linesRemoved: 12,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-12',
    projectId: 'mock-vbcdr',
    title: 'Command palette fuzzy ranking',
    description: 'Exact prefix matches should outrank substring hits.',
    stage: 'implementing',
    status: 'blocked',
    branch: 'llm/palette-ranking',
    worktreePath: '~/Sites/vibecoder/.worktrees/llm/palette-ranking',
    agent: 'gemini',
    createdAt: now - 5 * HOUR,
    updatedAt: now - 34 * MINUTE,
    filesChanged: 2,
    linesAdded: 47,
    linesRemoved: 31,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: 'Two ranking strategies conflict — pick one before I continue'
  },
  {
    id: 't-13',
    projectId: 'mock-vbcdr',
    title: 'Dev server port collision warning',
    description: 'Warn when two projects bind the same port.',
    stage: 'backlog',
    status: 'idle',
    branch: '—',
    worktreePath: '—',
    agent: 'claude',
    createdAt: now - 25 * MINUTE,
    updatedAt: now - 25 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-14',
    projectId: 'mock-vbcdr',
    title: 'Editor tab overflow scroll',
    description: 'Tabs shrink past legibility instead of scrolling.',
    stage: 'backlog',
    status: 'idle',
    branch: '—',
    worktreePath: '—',
    agent: 'claude',
    createdAt: now - 15 * MINUTE,
    updatedAt: now - 15 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [
      { id: 'a-3', name: 'tab-overflow.png', kind: 'image', dataUrl: null }
    ],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-15',
    projectId: 'mock-vbcdr',
    title: 'Statistics language tally off by one',
    description: 'Files with no extension are counted twice.',
    stage: 'review',
    status: 'awaiting-approval',
    branch: 'llm/stats-tally',
    worktreePath: '~/Sites/vibecoder/.worktrees/llm/stats-tally',
    agent: 'codex',
    createdAt: now - 30 * HOUR,
    updatedAt: now - 3 * HOUR,
    filesChanged: 1,
    linesAdded: 12,
    linesRemoved: 8,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true },
      { name: 'tests', passed: true }
    ],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: 'https://github.com/jestersimpps/vbcdr-electron/pull/238',
    comments: [],
    blockedReason: null
  },
  {
    id: 't-16',
    projectId: 'mock-latentpress',
    title: 'Cache OG images at the edge',
    description: 'Regenerating OG images on every request is slow.',
    stage: 'planning',
    status: 'running',
    branch: 'llm/og-cache',
    worktreePath: '~/Sites/latentpress/.worktrees/llm/og-cache',
    agent: 'claude',
    createdAt: now - 35 * MINUTE,
    updatedAt: now - 6 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-17',
    projectId: 'mock-latentpress',
    title: 'Author page pagination',
    description: 'Author pages load every book at once.',
    stage: 'planning',
    status: 'idle',
    branch: 'llm/author-pagination',
    worktreePath: '~/Sites/latentpress/.worktrees/llm/author-pagination',
    agent: 'gemini',
    createdAt: now - 70 * MINUTE,
    updatedAt: now - 22 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-18',
    projectId: 'mock-latentpress',
    title: 'Strip tracking params from canonical URLs',
    description: 'utm_* params leak into canonical tags.',
    stage: 'implementing',
    status: 'running',
    branch: 'llm/canonical-params',
    worktreePath: '~/Sites/latentpress/.worktrees/llm/canonical-params',
    agent: 'claude',
    createdAt: now - 7 * HOUR,
    updatedAt: now - 9 * MINUTE,
    filesChanged: 4,
    linesAdded: 63,
    linesRemoved: 21,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true }
    ],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-19',
    projectId: 'mock-globalpetsitter',
    title: 'Sitter availability calendar timezone drift',
    description: 'Availability shifts a day for sitters east of UTC+8.',
    stage: 'implementing',
    status: 'running',
    branch: 'llm/calendar-tz',
    worktreePath: '~/Sites/globalpetsitter/.worktrees/llm/calendar-tz',
    agent: 'claude',
    createdAt: now - 2 * HOUR,
    updatedAt: now - 7 * MINUTE,
    filesChanged: 9,
    linesAdded: 187,
    linesRemoved: 64,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-20',
    projectId: 'mock-globalpetsitter',
    title: 'Booking confirmation email copy',
    description: 'Rewrite the confirmation email in the brand voice.',
    stage: 'implementing',
    status: 'idle',
    branch: 'llm/booking-email-copy',
    worktreePath: '~/Sites/globalpetsitter/.worktrees/llm/booking-email-copy',
    agent: 'gemini',
    createdAt: now - 3 * HOUR,
    updatedAt: now - 48 * MINUTE,
    filesChanged: 2,
    linesAdded: 54,
    linesRemoved: 50,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-21',
    projectId: 'mock-globalpetsitter',
    title: 'Block scraper ASNs at the edge',
    description: 'One ASN accounts for most of the crawl volume.',
    stage: 'backlog',
    status: 'idle',
    branch: '—',
    worktreePath: '—',
    agent: 'claude',
    createdAt: now - 10 * MINUTE,
    updatedAt: now - 10 * MINUTE,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    comments: [],
    blockedReason: null
  },
  {
    id: 't-22',
    projectId: 'mock-globalpetsitter',
    title: 'Retry failed payout webhooks',
    description: 'Failed payout webhooks are dropped with no retry.',
    stage: 'done',
    status: 'idle',
    branch: 'llm/payout-retry',
    worktreePath: '—',
    agent: 'codex',
    createdAt: now - 40 * HOUR,
    updatedAt: now - 8 * HOUR,
    filesChanged: 4,
    linesAdded: 96,
    linesRemoved: 14,
    checks: [
      { name: 'typecheck', passed: true },
      { name: 'lint', passed: true },
      { name: 'tests', passed: true }
    ],
    attachments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: 'https://github.com/jestersimpps/globalpetsitter/pull/504',
    comments: [],
    blockedReason: null
  }
]
