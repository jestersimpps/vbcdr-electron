import { useEffect } from 'react'
import { AppLayoutGrid } from '@/components/layout/AppLayoutGrid'
import { UpdateBanner } from '@/components/layout/UpdateBanner'

import { ConflictBanner } from '@/components/git/ConflictBanner'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useUpdaterStore } from '@/stores/updater-store'
import { useGitStore } from '@/stores/git-store'
import { applyThemeToAll } from '@/components/terminal/TerminalInstance'

export function App(): React.ReactElement {
  const themeName = useThemeStore((s) => s.themeName)
  const variant = useThemeStore((s) => s.variant)

  useEffect(() => {
    const classes = Array.from(document.documentElement.classList)
    classes.forEach((cls) => {
      if (cls.endsWith('-dark') || cls.endsWith('-light')) {
        document.documentElement.classList.remove(cls)
      }
    })

    const fullThemeId = `${themeName}-${variant}`
    document.documentElement.classList.add(fullThemeId)

    applyThemeToAll(fullThemeId)
  }, [themeName, variant])

  useEffect(() => {
    return useUpdaterStore.getState().init()
  }, [])

  useEffect(() => {
    return useGitStore.getState().initFetchListener()
  }, [])

  useEffect(() => {
    return window.api.onMenuAction((action: string) => {
      const projectStore = useProjectStore.getState()
      const editorStore = useEditorStore.getState()
      const layoutStore = useLayoutStore.getState()
      const activeId = projectStore.activeProjectId

      const terminalStore = useTerminalStore.getState()
      const themeStore = useThemeStore.getState()

      switch (action) {
        case 'new-project':
          projectStore.addProject()
          break
        case 'close-project':
          if (activeId) projectStore.removeProject(activeId)
          break
        case 'center-tab-browser':
          if (activeId) {
            const bl = layoutStore.isBrowserless(activeId)
            editorStore.setCenterTab(activeId, bl ? 'terminals' : 'browser')
          }
          break
        case 'center-tab-editor':
          if (activeId) editorStore.setCenterTab(activeId, 'editor')
          break
        case 'center-tab-claude':
          if (activeId) editorStore.setCenterTab(activeId, 'claude')
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
      <UpdateBanner />
      <ConflictBanner />
      <AppLayoutGrid />
    </div>
  )
}
