import { useEffect } from 'react'
import { AppLayoutGrid } from '@/components/layout/AppLayoutGrid'
import { UpdateBanner } from '@/components/layout/UpdateBanner'
import { DriftBanner } from '@/components/git/DriftBanner'
import { ConflictBanner } from '@/components/git/ConflictBanner'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
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
      }
    })
  }, [])

  return (
    <>
      <UpdateBanner />
      <DriftBanner />
      <ConflictBanner />
      <AppLayoutGrid />
    </>
  )
}
