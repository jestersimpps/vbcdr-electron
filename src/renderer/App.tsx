import { useEffect } from 'react'
import { AppLayoutGrid } from '@/components/layout/AppLayoutGrid'
import { MonacoAnchor } from '@/components/editor/MonacoAnchor'
import { UpdateBanner } from '@/components/layout/UpdateBanner'

import { ConflictBanner } from '@/components/git/ConflictBanner'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useUpdaterStore } from '@/stores/updater-store'
import { useGitStore } from '@/stores/git-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import { applyThemeToAll } from '@/components/terminal/TerminalInstance'
import type { CustomThemeUI } from '@/models/custom-theme'
import type { FileNode } from '@/models/types'

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

function applyCustomVars(ui: CustomThemeUI): void {
  const style = `
    :root {
      --ct-bg-primary: ${ui.bgPrimary};
      --ct-bg-primary-rgb: ${hexToRgb(ui.bgPrimary)};
      --ct-bg-secondary: ${ui.bgSecondary};
      --ct-bg-secondary-rgb: ${hexToRgb(ui.bgSecondary)};
      --ct-bg-elevated: ${ui.bgElevated};
      --ct-bg-elevated-rgb: ${hexToRgb(ui.bgElevated)};
      --ct-bg-subtle: ${ui.bgSubtle};
      --ct-bg-subtle-rgb: ${hexToRgb(ui.bgSubtle)};
      --ct-text-1: ${ui.text1};
      --ct-text-2: ${ui.text2};
      --ct-text-3: ${ui.text3};
      --ct-border-1: ${ui.border1};
      --ct-border-2: ${ui.border2};
      --ct-border-2-rgb: ${hexToRgb(ui.border2)};
    }
  `
  let styleEl = document.getElementById('ct-vars')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'ct-vars'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = style
}

export function App(): React.ReactElement {
  const themeName = useThemeStore((s) => s.themeName)
  const variant = useThemeStore((s) => s.variant)
  const customDark = useThemeStore((s) => s.customDark)
  const customLight = useThemeStore((s) => s.customLight)

  useEffect(() => {
    const classes = Array.from(document.documentElement.classList)
    classes.forEach((cls) => {
      if (cls.endsWith('-dark') || cls.endsWith('-light')) {
        document.documentElement.classList.remove(cls)
      }
    })

    const fullThemeId = `${themeName}-${variant}`
    document.documentElement.classList.add(fullThemeId)

    if (themeName === 'custom') {
      const { customDark: cd, customLight: cl } = useThemeStore.getState()
      applyCustomVars(variant === 'dark' ? cd.ui : cl.ui)
    }

    applyThemeToAll(useThemeStore.getState().getTerminalThemeId())
  }, [themeName, variant])

  useEffect(() => {
    if (themeName !== 'custom') return
    const colors = variant === 'dark' ? customDark : customLight
    applyCustomVars(colors.ui)
    applyThemeToAll(useThemeStore.getState().getTerminalThemeId())
  }, [customDark, customLight])

  useEffect(() => {
    return useUpdaterStore.getState().init()
  }, [])

  useEffect(() => {
    return useGitStore.getState().initFetchListener()
  }, [])

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProjectPath = useProjectStore((s) =>
    s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId)?.path : undefined
  )

  useEffect(() => {
    if (!activeProjectId || !activeProjectPath) return
    const projectId = activeProjectId
    const cwd = activeProjectPath
    const showIgnored = useFileTreeStore.getState().showIgnoredPerProject[projectId] ?? true

    useFileTreeStore.getState().loadTree(projectId, cwd, showIgnored)
    useGitStore.getState().loadStatus(projectId, cwd)
    window.api.fs.watch(cwd, showIgnored)

    const unsub = window.api.fs.onTreeChanged((newTree) => {
      useFileTreeStore.getState().setTree(projectId, newTree as FileNode)
      useGitStore.getState().loadStatus(projectId, cwd)
    })

    return () => {
      unsub()
      window.api.fs.unwatch()
    }
  }, [activeProjectId, activeProjectPath])

  useEffect(() => {
    return window.api.onMenuAction((action: string) => {
      const projectStore = useProjectStore.getState()
      const editorStore = useEditorStore.getState()
      const activeId = projectStore.activeProjectId

      const terminalStore = useTerminalStore.getState()
      const themeStore = useThemeStore.getState()

      const projectPath = activeId
        ? projectStore.projects.find((p) => p.id === activeId)?.path
        : undefined
      const activeTabId = activeId ? terminalStore.activeTabPerProject[activeId] : undefined
      const activeTab = activeTabId ? terminalStore.tabs.find((t) => t.id === activeTabId) : undefined
      const activeLlmTab = activeId
        ? terminalStore.tabs.find(
            (t) => t.projectId === activeId && t.id === activeTabId && t.initialCommand
          ) ??
          terminalStore.tabs.find((t) => t.projectId === activeId && t.initialCommand)
        : undefined

      switch (action) {
        case 'new-project':
          projectStore.addProject()
          break
        case 'close-project':
          if (activeId) projectStore.removeProject(activeId)
          break
        case 'settings':
          projectStore.showSettings()
          break
        case 'show-statistics':
          projectStore.showStatistics()
          break
        case 'show-usage':
          projectStore.showUsage()
          break
        case 'center-tab-editor':
          if (activeId) editorStore.setCenterTab(activeId, 'editor')
          break
        case 'center-tab-claude':
          if (activeId) editorStore.setCenterTab(activeId, 'claude')
          break
        case 'center-tab-skills':
          if (activeId) editorStore.setCenterTab(activeId, 'skills')
          break
        case 'center-tab-terminals':
          if (activeId) editorStore.setCenterTab(activeId, 'terminals')
          break
        case 'toggle-dashboard':
          if (projectStore.dashboardActive && activeId) {
            projectStore.setActiveProject(activeId)
          } else {
            projectStore.showDashboard()
          }
          break
        case 'toggle-variant':
          themeStore.toggleVariant()
          break
        case 'open-palette':
          window.dispatchEvent(new CustomEvent('palette:open', { detail: { mode: 'all' } }))
          break
        case 'open-palette-files':
          window.dispatchEvent(new CustomEvent('palette:open', { detail: { mode: 'files' } }))
          break
        case 'save-file': {
          if (!activeId) break
          const filePath = editorStore.statePerProject[activeId]?.activeFilePath
          if (filePath) editorStore.saveFile(activeId, filePath)
          break
        }
        case 'close-file-tab': {
          if (!activeId) break
          const fp = editorStore.statePerProject[activeId]?.activeFilePath
          if (fp) editorStore.closeFile(activeId, fp)
          break
        }
        case 'new-claude-terminal':
          if (activeId && projectPath) {
            const cmd = useLayoutStore.getState().llmStartupCommand
            terminalStore.createTab(activeId, projectPath, cmd)
          }
          break
        case 'new-shell-terminal':
          if (activeId && projectPath) terminalStore.createTab(activeId, projectPath)
          break
        case 'restart-claude': {
          if (!activeId || !projectPath || !activeLlmTab?.initialCommand) break
          window.api.terminal.kill(activeLlmTab.id)
          terminalStore.replaceTab(activeLlmTab.id, activeId, projectPath, activeLlmTab.initialCommand)
          break
        }
        case 'clear-context': {
          const tabId = activeLlmTab?.id ?? activeTab?.id
          if (tabId) window.api.terminal.write(tabId, '/clear\r')
          break
        }
        case 'git-pull-rebase': {
          if (!activeId || !projectPath) break
          useGitStore.getState().pull(activeId, projectPath)
          break
        }
        case 'git-commit': {
          const tabId = activeLlmTab?.id ?? activeTab?.id
          if (tabId) window.api.terminal.write(tabId, '/commit\r')
          break
        }
        case 'terminal-tab-prev':
        case 'terminal-tab-next': {
          if (!activeId) break
          const tabs = terminalStore.tabs.filter((t) => t.projectId === activeId)
          if (tabs.length < 2) break
          const currentTabId = terminalStore.activeTabPerProject[activeId]
          const idx = tabs.findIndex((t) => t.id === currentTabId)
          const next =
            action === 'terminal-tab-next'
              ? (idx + 1) % tabs.length
              : (idx - 1 + tabs.length) % tabs.length
          terminalStore.setActiveTab(activeId, tabs[next].id)
          break
        }
        default: {
          const m = action.match(/^switch-project-(\d)$/)
          if (m) {
            const i = parseInt(m[1]) - 1
            if (i < projectStore.projects.length) {
              projectStore.setActiveProject(projectStore.projects[i].id)
            }
          }
          break
        }
      }
    })
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <MonacoAnchor />
      <UpdateBanner />
      <ConflictBanner />
      <AppLayoutGrid />
      <CommandPalette />
    </div>
  )
}
