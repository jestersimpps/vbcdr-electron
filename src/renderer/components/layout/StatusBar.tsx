import { FolderOpen, LayoutGrid, MonitorOff, Monitor } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useLayoutStore } from '@/stores/layout-store'
import { ThemePicker } from '@/components/theme/ThemePicker'
import { VariantToggle } from '@/components/theme/VariantToggle'
import { BranchSwitcher } from '@/components/git/BranchSwitcher'

export function StatusBar(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => s.activeProject)
  const resetLayout = useLayoutStore((s) => s.resetLayout)
  const toggleBrowserless = useLayoutStore((s) => s.toggleBrowserless)
  const browserless = useLayoutStore((s) => activeProjectId ? s.isBrowserless(activeProjectId) : false)

  const project = activeProject()

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-400">
      <div className="flex items-center gap-3 overflow-hidden">
        {project && (
          <div className="flex items-center gap-1.5 truncate">
            <FolderOpen size={13} className="shrink-0" />
            <span className="truncate">{project.path}</span>
          </div>
        )}
        <BranchSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {activeProjectId && (
          <>
            <button
              onClick={() => toggleBrowserless(activeProjectId)}
              className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title={browserless ? 'Switch to Browser mode' : 'Switch to Browserless mode'}
            >
              {browserless ? <Monitor size={13} /> : <MonitorOff size={13} />}
              <span>{browserless ? 'Browser' : 'Browserless'}</span>
            </button>
            <button
              onClick={() => resetLayout(activeProjectId)}
              className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title="Reset layout"
            >
              <LayoutGrid size={13} />
              <span>Reset</span>
            </button>
          </>
        )}
        <ThemePicker />
        <VariantToggle />
      </div>
    </div>
  )
}
