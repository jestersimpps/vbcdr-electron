import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useDevTerminalStore } from '@/stores/dev-terminal-store'
import { useEditorStore } from '@/stores/editor-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useGitStore } from '@/stores/git-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useThemeStore } from '@/stores/theme-store'
import { capabilitiesFor, providerDefinition } from '@/config/llm-provider-registry'
import { THEME_REGISTRY } from '@/config/theme-registry'
import { flattenTree } from '@/lib/flatten-tree'

const TREE_SAMPLE_SIZE = 40
const MAX_BRANCHES = 12

function activePageName(): string {
  const s = useProjectStore.getState()
  if (s.dashboardActive) return 'dashboard'
  if (s.statisticsActive) return 'statistics'
  if (s.usageActive) return 'usage'
  if (s.settingsActive) return 'settings'
  if (s.claudePageActive) return 'claude'
  if (s.skillsPageActive) return 'skills'
  if (s.mcpPageActive) return 'mcp'
  if (s.terminalsPageActive) return 'terminals'
  if (s.devServersPageActive) return 'dev-servers'
  if (s.voicePageActive) return 'voice'
  return 'workspace'
}

export function buildStateSnapshot(): string {
  const projectStore = useProjectStore.getState()
  const activeId = projectStore.activeProjectId
  const lines: string[] = ['[state]']

  const projects = projectStore.projects.map((p) => (p.id === activeId ? `${p.name}*` : p.name))
  lines.push(`projects: ${projects.length ? projects.join(', ') : '(none)'}`)

  if (!activeId) {
    lines.push(`page: ${activePageName()}`)
    return lines.join('\n')
  }

  const llmProviderId = useLayoutStore.getState().llmProviderId
  const llmLabel = providerDefinition(llmProviderId).label
  const caps = capabilitiesFor(llmProviderId)

  const terminalStore = useTerminalStore.getState()
  const activeTabId = terminalStore.activeTabPerProject[activeId]
  const tabs = terminalStore.tabs.filter((t) => t.projectId === activeId)
  if (tabs.length) {
    const rendered = tabs.map((t, i) => {
      const label = t.initialCommand ? `${t.title}(${llmLabel})` : t.title
      return `${i + 1}=${label}${t.id === activeTabId ? '*' : ''}`
    })
    lines.push(`tabs: ${rendered.join(', ')}`)
  }

  const devTabs = useDevTerminalStore.getState().tabs.filter((t) => t.projectId === activeId)
  if (devTabs.length) {
    lines.push(`dev-tabs: ${devTabs.map((t) => t.title).join(', ')}`)
  }

  const editorState = useEditorStore.getState().statePerProject[activeId]
  const openFiles = editorState?.openFiles ?? []
  if (openFiles.length) {
    const rendered = openFiles.map((f) =>
      f.path === editorState?.activeFilePath ? `${f.name}*` : f.name
    )
    lines.push(`files: ${rendered.join(', ')}`)
  }

  const tree = useFileTreeStore.getState().treePerProject[activeId]
  const allFiles = flattenTree(tree)
  if (allFiles.length) {
    const sample = allFiles.slice(0, TREE_SAMPLE_SIZE).map((f) => f.name)
    const suffix = allFiles.length > TREE_SAMPLE_SIZE ? ', …' : ''
    lines.push(`tree: ${allFiles.length} files (${sample.join(', ')}${suffix})`)
  }

  const branches = useGitStore.getState().branchesPerProject[activeId] ?? []
  if (branches.length) {
    const current = branches.find((b) => b.current)
    const others = branches
      .filter((b) => !b.current && !b.remote)
      .slice(0, MAX_BRANCHES)
      .map((b) => b.name)
    const rest = others.length ? ` (${others.join(', ')})` : ''
    lines.push(`branch: ${current?.name ?? 'unknown'}${rest}`)
  }

  lines.push(`page: ${activePageName()}`)

  const centerTab = useEditorStore.getState().centerTabPerProject[activeId] ?? 'editor'
  lines.push(`center-tab: ${centerTab}`)

  const gitCollapsed = useLayoutStore.getState().gitCollapsedPerProject[activeId]
  lines.push(`git-panel: ${gitCollapsed ? 'hidden' : 'visible'}`)

  const themeStore = useThemeStore.getState()
  lines.push(`theme: ${themeStore.themeName} (${themeStore.variant})`)
  lines.push(`themes: ${THEME_REGISTRY.map((t) => t.name).join(', ')}`)

  const disabled: string[] = []
  if (!caps.configFiles) disabled.push('claude-config')
  if (!caps.skills) disabled.push('skills')
  if (!caps.mcp) disabled.push('mcp')
  if (!caps.clearContext) disabled.push('clear-context')
  if (disabled.length) lines.push(`unavailable: ${disabled.join(', ')}`)

  return lines.join('\n')
}
