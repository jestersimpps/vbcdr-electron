import { useEffect } from 'react'
import { AppLayoutGrid } from '@/components/layout/AppLayoutGrid'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import { useEditorStore } from '@/stores/editor-store'
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
    return window.api.onMenuAction((action: string) => {
      const projectStore = useProjectStore.getState()
      const editorStore = useEditorStore.getState()
      const activeId = projectStore.activeProjectId

      switch (action) {
        case 'new-project':
          projectStore.addProject()
          break
        case 'close-project':
          if (activeId) projectStore.removeProject(activeId)
          break
        case 'center-tab-browser':
          if (activeId) editorStore.setCenterTab(activeId, 'browser')
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

  return <AppLayoutGrid />
}
