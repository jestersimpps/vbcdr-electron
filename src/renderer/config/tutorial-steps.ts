import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useLayoutStore } from '@/stores/layout-store'
import type { CenterTab } from '@/stores/editor-store'
import type { TutorialStep } from '@/models/tutorial'

function setPaletteOpen(open: boolean): void {
  window.dispatchEvent(new CustomEvent('palette:open', { detail: { mode: 'all', open } }))
}

function openWorkspace(tab: CenterTab): void {
  const { activeProjectId, setActiveProject } = useProjectStore.getState()
  if (!activeProjectId) return
  setActiveProject(activeProjectId)
  useEditorStore.getState().setCenterTab(activeProjectId, tab)
}

function expandPanels(): void {
  const { activeProjectId } = useProjectStore.getState()
  if (!activeProjectId) return
  const layout = useLayoutStore.getState()
  if (layout.gitCollapsedPerProject[activeProjectId]) {
    layout.toggleGitCollapsed(activeProjectId)
  }
  if (layout.devTerminalsCollapsedPerProject[activeProjectId]) {
    layout.toggleDevTerminalsCollapsed(activeProjectId)
  }
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to vbcdr',
    body: 'A workspace for running coding agents across several projects at once. This walkthrough moves the app to each area and highlights what it is talking about, so you are looking at the real thing.',
    tip: 'Arrow keys move between steps, Escape leaves. Nothing here changes your files.',
    placement: 'corner'
  },
  {
    id: 'project-tabs',
    requiresProject: true,
    title: 'Projects live in the title bar',
    body: 'Every project you open gets a tab up here. Drag them to reorder. The dot on each tab is that project\'s agent: pulsing amber means it is working, green means idle, so you can see at a glance who needs you.',
    tip: 'A background project that wants attention keeps pulsing until you click it.',
    target: '[data-tour="project-tabs"]',
    action: () => useProjectStore.getState().showDashboard()
  },
  {
    id: 'add-project',
    title: 'Add a project',
    body: 'This opens a folder picker. Pick any directory and it becomes a project with its own terminals, editor tabs and git state. Choosing a folder you already added just reselects it rather than duplicating.',
    tip: 'Cmd+N does the same thing from anywhere.',
    target: '[data-tour="add-project"]'
  },
  {
    id: 'no-project',
    title: 'Add a project to see the rest',
    body: 'The workspace, terminals, editor, git and per-project config all need a project open, so this walkthrough is skipping those for now. Add a folder and run the tutorial again to see them in place.',
    tip: 'The rest of the tour still covers everything that works without a project.',
    onlyWithoutProject: true,
    target: '[data-tour="add-project"]',
    action: () => useProjectStore.getState().showDashboard()
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    body: 'Your view across everything: work in progress, a running activity feed, an overview, and a card per project. Click a card for details, or click a work-in-progress row to jump into that project.',
    target: '[data-tour="nav-dashboard"]',
    action: () => useProjectStore.getState().showDashboard()
  },
  {
    id: 'workspace-tabs',
    requiresProject: true,
    title: 'The workspace has five tabs',
    body: 'Terminals, Editor and Diff are always here, with Claude and Skills alongside them when your provider supports them. Each tab stays alive in the background, so switching never kills a running terminal or loses your place.',
    target: '[data-tour="tab-terminals"]',
    action: () => {
      expandPanels()
      openWorkspace('terminals')
    }
  },
  {
    id: 'terminals',
    requiresProject: true,
    title: 'Terminals are where the agent runs',
    body: 'Dev terminals sit on the left, agent terminals on the right. Open several agent tabs and let them work in parallel. Each LLM tab shows live tokens per minute so you can see who is chewing through context.',
    target: '[data-tour="terminal-newtab"]',
    action: () => openWorkspace('terminals')
  },
  {
    id: 'terminal-tools',
    requiresProject: true,
    title: 'Terminal tools',
    body: 'Paste a screenshot straight into the agent from your clipboard, clear its context when a thread has gone stale, restart it, or reopen an earlier session from history. There is a find bar for scrollback too.',
    tip: 'Cmd+F inside a terminal jumps to its search box.',
    target: '[data-tour="terminal-screenshot"]',
    action: () => openWorkspace('terminals')
  },
  {
    id: 'collapse-devterms',
    requiresProject: true,
    title: 'Collapse what you are not using',
    body: 'The dev terminals pane folds away to a thin rail with this button, giving the agent terminals the full width. The rail keeps an arrow to bring it back.',
    tip: 'Most panes in the workspace collapse this way, and each project remembers its own layout.',
    target: '[data-tour="devterms-collapse"], [data-tour="devterms-expand"]',
    action: () => openWorkspace('terminals')
  },
  {
    id: 'editor',
    requiresProject: true,
    title: 'Editor',
    body: 'A file tree beside a full Monaco editor with draggable tabs. Open files to read what the agent changed, or edit them yourself. The tree follows changes on disk as they land.',
    target: '[data-tour="tab-editor"]',
    action: () => openWorkspace('editor')
  },
  {
    id: 'filetree-tools',
    requiresProject: true,
    title: 'File tree tools',
    body: 'Search files by name, create a file or folder, refresh, and toggle whether gitignored files show. Right-click any node for rename, delete and reveal.',
    tip: 'Cmd+P is quicker for opening a file you can name. Cmd+Shift+F searches inside files across the project.',
    target: '[data-tour="filetree-search"]',
    action: () => openWorkspace('editor')
  },
  {
    id: 'ignored-files',
    requiresProject: true,
    title: 'Hidden and ignored files',
    body: 'The eye toggles gitignored files in and out of the tree. Handy when you need to look at something in a build folder or an env file the agent cannot normally see.',
    target: '[data-tour="filetree-ignored"]',
    action: () => openWorkspace('editor')
  },
  {
    id: 'diff',
    requiresProject: true,
    title: 'Diff',
    body: 'A side by side Monaco diff of what changed, where you can leave inline review comments and jump between them with the arrow keys. This is the fastest way to check the agent\'s work before it goes anywhere.',
    target: '[data-tour="tab-diff"]',
    action: () => openWorkspace('diff')
  },
  {
    id: 'git-panel',
    requiresProject: true,
    title: 'Git lives on the right',
    body: 'Branch switcher, incoming commits to pull, your uncommitted changes, unpushed commits to push, and the commit graph. Click any commit to open it as a diff.',
    tip: 'Drag the divider to resize it. Sections only appear when they have something in them, so a clean repo looks quiet.',
    target: '[data-tour="git-collapse"], [data-tour="git-expand"]',
    action: () => {
      expandPanels()
      openWorkspace('diff')
    }
  },
  {
    id: 'commit',
    requiresProject: true,
    title: 'Committing',
    body: 'Write a commit message and commit as usual, or leave the box empty and the agent writes the message from your staged changes.',
    tip: 'This only shows up when you actually have uncommitted changes.',
    target: '[data-tour="git-commit-input"]',
    action: () => {
      expandPanels()
      openWorkspace('diff')
    }
  },
  {
    id: 'project-claude',
    requiresProject: true,
    title: 'Claude config for this project',
    body: 'The Claude tab edits this repo\'s own .claude folder: its CLAUDE.md and any project-local config, hooks and commands. This is what shapes the agent\'s behaviour in this project only.',
    capability: 'configFiles',
    target: '[data-tour="tab-claude"]',
    action: () => openWorkspace('claude')
  },
  {
    id: 'project-skills',
    requiresProject: true,
    title: 'Skills for this project',
    body: 'Search the skills registry and install into this project\'s .claude/skills. The list here shows only what this project has, so you can give one repo a skill without every other project picking it up.',
    capability: 'skills',
    target: '[data-tour="tab-skills"]',
    action: () => openWorkspace('skills')
  },
  {
    id: 'open-folder',
    requiresProject: true,
    title: 'Open the project folder',
    body: 'Reveals the project in Finder when you need to do something outside the app.',
    target: '[data-tour="open-project-folder"]',
    action: () => openWorkspace('editor')
  },
  {
    id: 'global-claude',
    title: 'Global agent config',
    body: 'The sidebar Claude page edits your machine-wide ~/.claude instead: global config, hooks, skills and commands that apply everywhere. It comes with its own terminal already in that folder and git history for it.',
    tip: 'Project config for one repo, this page for every repo.',
    capability: 'configFiles',
    target: '[data-tour="nav-claude"]',
    action: () => useProjectStore.getState().showClaudePage()
  },
  {
    id: 'global-skills',
    title: 'Global skills',
    body: 'Same registry search, but installing here targets ~/.claude/skills so every project gets it. The installed list is split by scope so you can always tell what is global and what belongs to a project.',
    capability: 'skills',
    target: '[data-tour="nav-skills"]',
    action: () => useProjectStore.getState().showSkillsPage()
  },
  {
    id: 'mcp',
    title: 'MCP servers',
    body: 'Give the agent access to things outside your repo. Add from the built-in catalog, Playwright, GitHub, Supabase, Linear and more, or configure your own. Each shows whether it is connected or needs auth.',
    tip: 'Scope matters: User applies to every project, Project and Local stay with this repo.',
    capability: 'mcp',
    target: '[data-tour="nav-mcp"]',
    action: () => useProjectStore.getState().showMcpPage()
  },
  {
    id: 'global-terminals',
    title: 'Global terminals',
    body: 'A terminal that is not tied to any project, rooted at the folder you set in Settings. Good for the odd job that does not belong to a repo.',
    target: '[data-tour="nav-terminals"]',
    action: () => useProjectStore.getState().showTerminalsPage()
  },
  {
    id: 'devservers',
    title: 'Dev servers',
    body: 'Every listening process on your machine in one table, refreshed as you watch: port, folder, uptime, CPU and memory. Open a port in the browser, or kill whatever is squatting on the port you need.',
    target: '[data-tour="nav-devservers"]',
    action: () => useProjectStore.getState().showDevServersPage()
  },
  {
    id: 'voice',
    flag: 'voiceControl',
    title: 'Voice control',
    body: 'Drive the app by talking to it. Pick a microphone, start the session, then speak to switch projects, open pages and send work to your agent. The history pane shows what was heard and what it did.',
    tip: 'Keep "confirm destructive actions" on so a mishearing cannot do anything irreversible.',
    target: '[data-tour="nav-voice"]',
    action: () => useProjectStore.getState().showVoicePage()
  },
  {
    id: 'statistics',
    title: 'Statistics',
    body: 'Where your hours actually went, worked out from your commit history: a contribution heatmap, a daily timeline and a sortable table per project. Switch the window between today, the last 7 days, this month and more.',
    tip: 'Tune the session gap and idle threshold if the hours do not match how you actually work.',
    target: '[data-tour="nav-statistics"]',
    action: () => useProjectStore.getState().showStatistics()
  },
  {
    id: 'usage',
    title: 'Usage',
    body: 'Token consumption per agent terminal against the cap you set, with a velocity sparkline, plus a daily chart broken down by project.',
    target: '[data-tour="nav-usage"]',
    action: () => useProjectStore.getState().showUsage()
  },
  {
    id: 'permissions',
    requiresProject: true,
    title: 'Permissions',
    body: 'The shield in the status bar edits what your agent is allowed to do without asking, across allow, ask and deny. Save combinations you trust as presets and switch between them per project.',
    capability: 'permissions',
    target: '[data-tour="permissions"]',
    action: () => {
      const { activeProjectId, setActiveProject } = useProjectStore.getState()
      if (activeProjectId) setActiveProject(activeProjectId)
    }
  },
  {
    id: 'theme',
    title: 'Themes',
    body: 'Pick a theme or build your own, and flip between light and dark. The terminal follows along, and the accent colour you are seeing on this card comes from whatever theme is active.',
    tip: 'Cmd+Shift+L toggles light and dark without opening anything.',
    target: '[data-tour="theme-picker"]'
  },
  {
    id: 'palette',
    title: 'The command palette is the shortcut for all of this',
    body: 'Here it is, open. Cmd+K gets you this from anywhere: jump to a project or terminal, open a page, start a terminal, toggle a setting. Cmd+P searches files instead. Type a full sentence and it offers to send it straight to your agent.',
    tip: 'When you forget where something lives, Cmd+K first.',
    placement: 'corner',
    action: () => setPaletteOpen(true),
    cleanup: () => setPaletteOpen(false)
  },
  {
    id: 'settings',
    title: 'Settings, and you are set',
    body: 'Your agent provider and startup command, token caps, notification sounds, editor preferences, themes and permission presets all live here.',
    tip: 'Reopen this walkthrough any time from the question mark in the sidebar, or search "tutorial" in the command palette.',
    target: '[data-tour="nav-settings"]',
    action: () => useProjectStore.getState().showSettings()
  }
]
