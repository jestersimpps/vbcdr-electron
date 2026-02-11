import { FolderOpen, GitBranch, Sun, Moon, LayoutGrid } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { useThemeStore } from '@/stores/theme-store'
import { useLayoutStore } from '@/stores/layout-store'

export function StatusBar(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => s.activeProject)
  const branchesPerProject = useGitStore((s) => s.branchesPerProject)
  const { theme, toggleTheme } = useThemeStore()
  const resetLayout = useLayoutStore((s) => s.resetLayout)

  const project = activeProject()
  const branches = activeProjectId ? branchesPerProject[activeProjectId] : undefined
  const currentBranch = branches?.find((b) => b.current)

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-400">
      <div className="flex items-center gap-3 overflow-hidden">
        {project && (
          <div className="flex items-center gap-1.5 truncate">
            <FolderOpen size={13} className="shrink-0" />
            <span className="truncate">{project.path}</span>
          </div>
        )}
        {currentBranch && (
          <div className="flex items-center gap-1.5 shrink-0">
            <GitBranch size={13} />
            <span>{currentBranch.name}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {activeProjectId && (
          <button
            onClick={() => resetLayout(activeProjectId)}
            className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Reset layout"
          >
            <LayoutGrid size={13} />
            <span>Reset</span>
          </button>
        )}
        <button
          onClick={toggleTheme}
          className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </div>
  )
}
