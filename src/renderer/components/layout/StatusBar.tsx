import { FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { ThemePicker } from '@/components/theme/ThemePicker'
import { VariantToggle } from '@/components/theme/VariantToggle'
import { PermissionsButton } from '@/components/terminal/PermissionsButton'

export function StatusBar(): React.ReactElement {
  const activeProject = useProjectStore((s) => s.activeProject)

  const project = activeProject()

  return (
    <div className="relative z-20 flex h-6 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-400">
      <div className="flex items-center gap-3 overflow-hidden min-w-0">
        {project && (
          <div className="flex items-center gap-1.5 truncate">
            <FolderOpen size={13} className="shrink-0" />
            <span className="truncate">{project.path}</span>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="pointer-events-auto">
          <PermissionsButton projectPath={project?.path} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemePicker />
        <VariantToggle />
      </div>
    </div>
  )
}
