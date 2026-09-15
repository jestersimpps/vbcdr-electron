import { useEffect } from 'react'
import { AppLayoutGrid } from '@/components/layout/AppLayoutGrid'
import { MonacoAnchor } from '@/components/editor/MonacoAnchor'
import { UpdateBanner } from '@/components/layout/UpdateBanner'

import { ConflictBanner } from '@/components/git/ConflictBanner'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { GlobalSearchPanel } from '@/components/editor/GlobalSearchPanel'
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import { dispatchAppAction } from '@/lib/app-actions'
import { ShortcutHintsController } from '@/components/layout/ShortcutHintsController'
import { useUpdaterStore } from '@/stores/updater-store'
import { useClipboardStore } from '@/stores/clipboard-store'
import { useGitStore } from '@/stores/git-store'
import { useFileTreeStore } from '@/stores/filetree-store'
import { useLayoutStore } from '@/stores/layout-store'
import { applyThemeToAll } from '@/components/terminal/TerminalInstance'
import { useSdlcStageWatcher } from '@/hooks/useSdlcStageWatcher'
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
  useSdlcStageWatcher()
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
    return useClipboardStore.getState().init()
  }, [])

  useEffect(() => {
    return useGitStore.getState().initFetchListener()
  }, [])

  /**
   * Resolved here rather than in CompanionDock: every new LLM tab reads this
   * path through getLlmStartupCommand, and tabs can be opened before (or
   * without) the dock ever mounting. Owning it at app level means a companion
   * session always starts with the prompt appended.
   */
  useEffect(() => {
    let cancelled = false
    window.api.companion
      .ensurePrompt()
      .then((path: string) => {
        if (!cancelled) useLayoutStore.getState().setCompanionPromptPath(path)
      })
      .catch(() => {
        if (!cancelled) useLayoutStore.getState().setCompanionPromptPath(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProjectPath = useProjectStore((s) =>
    s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId)?.path : undefined
  )

  useEffect(() => {
    if (!activeProjectId || !activeProjectPath) return
    const projectId = activeProjectId
    const cwd = activeProjectPath
    const fileTreeStore = useFileTreeStore.getState()
    const showIgnored = fileTreeStore.showIgnoredPerProject[projectId] ?? false
    const cachedTree = fileTreeStore.treePerProject[projectId]
    const cachedPath = fileTreeStore.cwdPerProject[projectId]

    if (!cachedTree || cachedPath !== cwd) {
      fileTreeStore.loadTree(projectId, cwd, showIgnored)
    }
    window.api.fs.watch(cwd, showIgnored)
    window.api.git.watchRefs(projectId, cwd)

    const unsubTree = window.api.fs.onTreeChanged((newTree) => {
      useFileTreeStore.getState().setTree(projectId, newTree as FileNode)
      useGitStore.getState().loadStatus(projectId, cwd)
    })

    const unsubRefs = window.api.git.onRefsChanged((changedId) => {
      if (changedId !== projectId) return
      const git = useGitStore.getState()
      void git.loadGitData(projectId, cwd)
      void git.loadStatus(projectId, cwd)
      void git.loadRangeFileCounts(projectId, cwd)
    })

    return () => {
      unsubTree()
      unsubRefs()
      window.api.fs.unwatch()
      window.api.git.unwatchRefs(projectId)
    }
  }, [activeProjectId, activeProjectPath])

  useEffect(() => {
    return window.api.onMenuAction((action: string) => {
      dispatchAppAction({ action })
    })
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ShortcutHintsController />
      <MonacoAnchor />
      <UpdateBanner />
      <ConflictBanner />
      <AppLayoutGrid />
      <CommandPalette />
      <GlobalSearchPanel />
      <TutorialOverlay />
    </div>
  )
}
