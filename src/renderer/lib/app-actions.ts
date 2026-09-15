import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useTerminalStore, defaultLlmTab, startupCommandForTab, tabProfileMeta } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useThemeStore } from '@/stores/theme-store'
import { useTutorialStore } from '@/stores/tutorial-store'
import { useGitStore } from '@/stores/git-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useEditorPrefsStore } from '@/stores/editor-prefs-store'
import { disposeTerminal, focusTerminal } from '@/components/terminal/TerminalInstance'
import { THEME_REGISTRY } from '@/config/theme-registry'
import { isSdlcTab } from '@/config/terminal-profiles'
import { flattenTree } from '@/lib/flatten-tree'
import {
  resolveByName,
  resolveByOrdinalOrName,
  resolveFilePath
} from '@/lib/voice/resolve-target'
import {
  capabilitiesFor,
  clearContextCommandFor,
  providerDefinition
} from '@/config/llm-provider-registry'
import type { LlmProviderCapabilities } from '@/config/llm-provider-registry'
import type { CenterTab } from '@/stores/editor-store'
import type { TerminalTab } from '@/models/types'

export interface AppActionRequest {
  action: string
  target?: string
}

export type DispatchFailure =
  | 'unknown-action'
  | 'no-target'
  | 'unresolved'
  | 'no-project'
  | 'capability-off'

export type DispatchResult = { ok: true; say: string } | { ok: false; reason: DispatchFailure }

export interface DispatchContext {
  activeProjectId: string | null
  projectPath: string | undefined
  activeTab: TerminalTab | undefined
  activeLlmTab: TerminalTab | undefined
}

export interface ActionSpec {
  run: (target: string | undefined, ctx: DispatchContext) => DispatchResult
  needsTarget: boolean
  destructive: boolean
  capability?: keyof LlmProviderCapabilities
}

const ok = (say: string): DispatchResult => ({ ok: true, say })
const fail = (reason: DispatchFailure): DispatchResult => ({ ok: false, reason })

const TRUTHY_TARGETS = ['on', 'true', 'enable', 'enabled', 'yes', 'show']
const FALSY_TARGETS = ['off', 'false', 'disable', 'disabled', 'no', 'hide']

export function resolveBooleanTarget(target: string | undefined, current: boolean): boolean {
  if (!target) return !current
  const t = target.trim().toLowerCase()
  if (TRUTHY_TARGETS.includes(t)) return true
  if (FALSY_TARGETS.includes(t)) return false
  return !current
}

export function buildDispatchContext(): DispatchContext {
  const projectStore = useProjectStore.getState()
  const terminalStore = useTerminalStore.getState()
  const activeProjectId = projectStore.activeProjectId

  const projectPath = activeProjectId
    ? projectStore.projects.find((p) => p.id === activeProjectId)?.path
    : undefined
  const activeTabId = activeProjectId
    ? terminalStore.activeTabPerProject[activeProjectId]
    : undefined
  const activeTab = activeTabId ? terminalStore.tabs.find((t) => t.id === activeTabId) : undefined
  const activeLlmTab = activeProjectId
    ? (terminalStore.tabs.find(
        (t) => t.projectId === activeProjectId && t.id === activeTabId && t.initialCommand
      ) ??
      terminalStore.tabs.find((t) => t.projectId === activeProjectId && t.initialCommand))
    : undefined

  return { activeProjectId, projectPath, activeTab, activeLlmTab }
}

function cycleTerminalTab(direction: 'next' | 'prev', ctx: DispatchContext): DispatchResult {
  const { activeProjectId } = ctx
  if (!activeProjectId) return fail('no-project')
  const terminalStore = useTerminalStore.getState()
  const tabs = terminalStore.tabs.filter((t) => t.projectId === activeProjectId)
  if (tabs.length < 2) return fail('unresolved')
  const currentTabId = terminalStore.activeTabPerProject[activeProjectId]
  const idx = tabs.findIndex((t) => t.id === currentTabId)
  const next =
    direction === 'next' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length
  terminalStore.setActiveTab(activeProjectId, tabs[next].id)
  return ok(`Switched to ${tabs[next].title}`)
}

export function showWorkspaceTab(tab: CenterTab): boolean {
  const { activeProjectId, setActiveProject } = useProjectStore.getState()
  if (!activeProjectId) return false
  setActiveProject(activeProjectId)
  useEditorStore.getState().setCenterTab(activeProjectId, tab)
  return true
}

function centerTabSpec(tab: CenterTab, say: string, capability?: keyof LlmProviderCapabilities): ActionSpec {
  return {
    needsTarget: false,
    destructive: false,
    capability,
    run: () => (showWorkspaceTab(tab) ? ok(say) : fail('no-project'))
  }
}

export const ACTION_SPECS: Record<string, ActionSpec> = {
  'new-project': {
    needsTarget: false,
    destructive: false,
    run: () => {
      void useProjectStore.getState().addProject()
      return ok('Adding a project')
    }
  },
  'close-project': {
    needsTarget: false,
    destructive: true,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId) return fail('no-project')
      void useProjectStore.getState().removeProject(ctx.activeProjectId)
      return ok('Closed the project')
    }
  },
  settings: {
    needsTarget: false,
    destructive: false,
    run: () => {
      useProjectStore.getState().showSettings()
      return ok('Opened settings')
    }
  },
  'show-tutorial': {
    needsTarget: false,
    destructive: false,
    run: () => {
      useTutorialStore.getState().startTutorial()
      return ok('Starting the tutorial')
    }
  },
  'show-statistics': {
    needsTarget: false,
    destructive: false,
    run: () => {
      useProjectStore.getState().showStatistics()
      return ok('Opened statistics')
    }
  },
  'show-usage': {
    needsTarget: false,
    destructive: false,
    run: () => {
      useProjectStore.getState().showUsage()
      return ok('Opened usage')
    }
  },
  'center-tab-editor': centerTabSpec('editor', 'Opened the editor'),
  'center-tab-claude': centerTabSpec('claude', 'Opened the config files', 'configFiles'),
  'center-tab-skills': centerTabSpec('skills', 'Opened skills', 'skills'),
  'center-tab-terminals': centerTabSpec('terminals', 'Opened terminals'),
  'toggle-dashboard': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      const projectStore = useProjectStore.getState()
      if (projectStore.dashboardActive && ctx.activeProjectId) {
        projectStore.setActiveProject(ctx.activeProjectId)
        return ok('Back to the workspace')
      }
      projectStore.showDashboard()
      return ok('Opened the dashboard')
    }
  },
  'toggle-variant': {
    needsTarget: false,
    destructive: false,
    run: () => {
      useThemeStore.getState().toggleVariant()
      return ok('Toggled light and dark')
    }
  },
  'open-palette': {
    needsTarget: false,
    destructive: false,
    run: () => {
      window.dispatchEvent(new CustomEvent('palette:open', { detail: { mode: 'all' } }))
      return ok('Opened the command palette')
    }
  },
  'open-palette-files': {
    needsTarget: false,
    destructive: false,
    run: () => {
      window.dispatchEvent(new CustomEvent('palette:open', { detail: { mode: 'files' } }))
      return ok('Opened file search')
    }
  },
  'global-search': {
    needsTarget: false,
    destructive: false,
    run: () => {
      window.dispatchEvent(new CustomEvent('global-search:toggle'))
      return ok('Toggled search in files')
    }
  },
  'save-file': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId) return fail('no-project')
      const editorStore = useEditorStore.getState()
      const filePath = editorStore.statePerProject[ctx.activeProjectId]?.activeFilePath
      if (!filePath) return fail('unresolved')
      void editorStore.saveFile(ctx.activeProjectId, filePath)
      return ok('Saved the file')
    }
  },
  'close-file-tab': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId) return fail('no-project')
      const editorStore = useEditorStore.getState()
      const filePath = editorStore.statePerProject[ctx.activeProjectId]?.activeFilePath
      if (!filePath) return fail('unresolved')
      editorStore.closeFile(ctx.activeProjectId, filePath)
      return ok('Closed the file')
    }
  },
  'new-claude-terminal': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId || !ctx.projectPath) return fail('no-project')
      const { command, profile } = defaultLlmTab()
      void useTerminalStore.getState().createTab(ctx.activeProjectId, ctx.projectPath, command, undefined, profile)
      return ok('Opened a new LLM terminal')
    }
  },
  'new-shell-terminal': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId || !ctx.projectPath) return fail('no-project')
      void useTerminalStore.getState().createTab(ctx.activeProjectId, ctx.projectPath)
      return ok('Opened a new shell terminal')
    }
  },
  'restart-claude': {
    needsTarget: false,
    destructive: true,
    run: (_target, ctx) => {
      const { activeProjectId, projectPath, activeLlmTab } = ctx
      if (!activeProjectId || !projectPath || !activeLlmTab?.initialCommand) {
        return fail('unresolved')
      }
      window.api.terminal.kill(activeLlmTab.id)
      disposeTerminal(activeLlmTab.id)
      useTerminalStore
        .getState()
        .replaceTab(
          activeLlmTab.id,
          activeProjectId,
          projectPath,
          startupCommandForTab(activeLlmTab),
          tabProfileMeta(activeLlmTab)
        )
      return ok('Restarted the LLM terminal')
    }
  },
  'clear-context': {
    needsTarget: false,
    destructive: true,
    capability: 'clearContext',
    run: (_target, ctx) => {
      const tabId = ctx.activeLlmTab?.id ?? ctx.activeTab?.id
      const clearCommand = clearContextCommandFor(useLayoutStore.getState().llmProviderId)
      if (!tabId || !clearCommand) return fail('unresolved')
      window.api.terminal.write(tabId, `${clearCommand}\r`)
      return ok('Cleared the context')
    }
  },
  'git-pull-rebase': {
    needsTarget: false,
    destructive: true,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId || !ctx.projectPath) return fail('no-project')
      void useGitStore.getState().pull(ctx.activeProjectId, ctx.projectPath)
      return ok('Pulling with rebase')
    }
  },
  'git-commit': {
    needsTarget: false,
    destructive: true,
    run: (_target, ctx) => {
      const tabId = ctx.activeLlmTab?.id ?? ctx.activeTab?.id
      if (!tabId) return fail('unresolved')
      window.api.terminal.write(tabId, '/commit\r')
      return ok('Committing')
    }
  },
  'terminal-tab-next': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => cycleTerminalTab('next', ctx)
  },
  'terminal-tab-prev': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => cycleTerminalTab('prev', ctx)
  },
  'paste-screenshot': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      const tabId = ctx.activeTab?.id ?? ctx.activeLlmTab?.id
      if (!tabId) return fail('unresolved')
      void window.api.terminal.pasteClipboardImage(tabId)
      return ok('Pasted the screenshot')
    }
  },
  'reload-tree': {
    needsTarget: false,
    destructive: false,
    run: (_target, ctx) => {
      if (!ctx.activeProjectId || !ctx.projectPath) return fail('no-project')
      void useFileTreeStore.getState().loadTree(ctx.activeProjectId, ctx.projectPath)
      return ok('Reloaded the file tree')
    }
  },
  'toggle-minimap': {
    needsTarget: false,
    destructive: false,
    run: (target) => {
      const prefs = useEditorPrefsStore.getState()
      const next = resolveBooleanTarget(target, prefs.minimapEnabled)
      prefs.setMinimapEnabled(next)
      return ok(next ? 'Minimap on' : 'Minimap off')
    }
  },
  'toggle-autosave': {
    needsTarget: false,
    destructive: false,
    run: (target) => {
      const prefs = useEditorPrefsStore.getState()
      const next = resolveBooleanTarget(target, prefs.autosaveEnabled)
      prefs.setAutosaveEnabled(next)
      return ok(next ? 'Autosave on' : 'Autosave off')
    }
  },
  'toggle-format-on-save': {
    needsTarget: false,
    destructive: false,
    run: (target) => {
      const prefs = useEditorPrefsStore.getState()
      const next = resolveBooleanTarget(target, prefs.formatOnSave)
      prefs.setFormatOnSave(next)
      return ok(next ? 'Format on save on' : 'Format on save off')
    }
  },
  'switch-project': {
    needsTarget: true,
    destructive: false,
    run: (target) => {
      const projectStore = useProjectStore.getState()
      const resolved = resolveByOrdinalOrName(
        target as string,
        projectStore.projects.map((p) => ({ value: p, label: p.name }))
      )
      if (!resolved) return fail('unresolved')
      projectStore.setActiveProject(resolved.id)
      return ok(`Switched to ${resolved.name}`)
    }
  },
  'focus-terminal': {
    needsTarget: true,
    destructive: false,
    run: (target, ctx) => {
      if (!ctx.activeProjectId) return fail('no-project')
      const terminalStore = useTerminalStore.getState()
      const tabs = terminalStore.tabs.filter((t) => t.projectId === ctx.activeProjectId)
      if (tabs.length === 0) return fail('unresolved')

      const llmLabel = providerDefinition(useLayoutStore.getState().llmProviderId).label
      const resolved = resolveByOrdinalOrName(
        target as string,
        tabs.map((t) => ({
          value: t,
          label: t.title,
          aliases: t.initialCommand ? ['llm', llmLabel] : []
        }))
      )
      if (!resolved) return fail('unresolved')

      terminalStore.setActiveTab(ctx.activeProjectId, resolved.id)
      showWorkspaceTab('terminals')
      focusTerminal(resolved.id)
      return ok(`Focused ${resolved.title}`)
    }
  },
  'open-file': {
    needsTarget: true,
    destructive: false,
    run: (target, ctx) => {
      if (!ctx.activeProjectId || !ctx.projectPath) return fail('no-project')
      const tree = useFileTreeStore.getState().treePerProject[ctx.activeProjectId]
      const files = flattenTree(tree)
      const path = resolveFilePath(target as string, files)
      if (!path) return fail('unresolved')
      const name = files.find((f) => f.path === path)?.name ?? path.split('/').pop() ?? path
      void useEditorStore.getState().openFile(ctx.activeProjectId, path, name, ctx.projectPath)
      showWorkspaceTab('editor')
      return ok(`Opened ${name}`)
    }
  },
  'switch-branch': {
    needsTarget: true,
    destructive: true,
    run: (target, ctx) => {
      const { activeProjectId, projectPath } = ctx
      if (!activeProjectId || !projectPath) return fail('no-project')
      const gitStore = useGitStore.getState()
      const branches = gitStore.branchesPerProject[activeProjectId] ?? []
      const resolved = resolveByName(
        target as string,
        branches.map((b) => ({ value: b, label: b.name }))
      )
      if (!resolved) return fail('unresolved')
      void gitStore.switchBranch(activeProjectId, projectPath, resolved.name).then((success) => {
        if (success) void useFileTreeStore.getState().loadTree(activeProjectId, projectPath)
      })
      return ok(`Switching to ${resolved.name}`)
    }
  },
  'show-git': {
    needsTarget: false,
    destructive: false,
    run: (target, ctx) => {
      if (!ctx.activeProjectId) return fail('no-project')
      const layout = useLayoutStore.getState()
      const currentlyVisible = !layout.gitCollapsedPerProject[ctx.activeProjectId]
      const visible = resolveBooleanTarget(target, currentlyVisible)
      layout.setGitCollapsed(ctx.activeProjectId, !visible)
      return ok(visible ? 'Showing git' : 'Hid git')
    }
  },
  'set-theme': {
    needsTarget: true,
    destructive: false,
    run: (target) => {
      const resolved = resolveByName(
        target as string,
        THEME_REGISTRY.map((t) => ({ value: t, label: t.name, aliases: [t.id] }))
      )
      if (!resolved) return fail('unresolved')
      useThemeStore.getState().setTheme(resolved.id)
      return ok(`Theme set to ${resolved.name}`)
    }
  }
}

function switchProjectByIndex(index: number): DispatchResult {
  const projectStore = useProjectStore.getState()
  if (index < 0 || index >= projectStore.projects.length) return fail('unresolved')
  const project = projectStore.projects[index]
  projectStore.setActiveProject(project.id)
  return ok(`Switched to ${project.name}`)
}

function switchTerminalByIndex(index: number): DispatchResult {
  const projectId = useProjectStore.getState().activeProjectId
  if (!projectId) return fail('no-project')
  const terminalStore = useTerminalStore.getState()
  const tab = terminalStore.tabs.filter(
    (candidate) => candidate.projectId === projectId && candidate.initialCommand && !isSdlcTab(candidate)
  )[index]
  if (!tab) return fail('unresolved')
  terminalStore.setActiveTab(projectId, tab.id)
  return ok(`Switched to ${tab.title}`)
}

export function dispatchAppAction(req: AppActionRequest): DispatchResult {
  const spec = ACTION_SPECS[req.action]
  if (!spec) {
    const m = req.action.match(/^switch-project-(\d)$/)
    if (m) return switchProjectByIndex(parseInt(m[1]) - 1)
    const terminal = req.action.match(/^switch-terminal-(\d)$/)
    if (terminal) return switchTerminalByIndex(parseInt(terminal[1]) - 1)
    return fail('unknown-action')
  }
  if (spec.capability) {
    const caps = capabilitiesFor(useLayoutStore.getState().llmProviderId)
    if (!caps[spec.capability]) return fail('capability-off')
  }
  if (spec.needsTarget && !req.target) return fail('no-target')
  return spec.run(req.target, buildDispatchContext())
}
