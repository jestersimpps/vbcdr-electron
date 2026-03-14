import { useEffect } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProjectSelector(): React.ReactElement {
  const { projects, activeProjectId, loadProjects, addProject, removeProject, setActiveProject } =
    useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Projects
        </span>
        <button
          onClick={addProject}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <Plus size={14} />
        </button>
      </div>

      {[...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((project) => (
        <div
          key={project.id}
          className={cn(
            'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
            activeProjectId === project.id
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
          )}
          onClick={() => setActiveProject(project.id)}
        >
          <FolderOpen size={14} className="shrink-0" />
          <span className="truncate">{project.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeProject(project.id)
            }}
            className="ml-auto hidden rounded p-0.5 text-zinc-600 hover:text-red-400 group-hover:block"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {projects.length === 0 && (
        <div className="px-2 py-4 text-center text-xs text-zinc-600">
          No projects yet
          <br />
          Click + to add a folder
        </div>
      )}
    </div>
  )
}
