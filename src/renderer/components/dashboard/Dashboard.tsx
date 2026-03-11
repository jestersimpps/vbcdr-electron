import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { ProjectCard } from '@/components/dashboard/ProjectCard'

export function Dashboard(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const addProject = useProjectStore((s) => s.addProject)
  const loadGitData = useGitStore((s) => s.loadGitData)

  useEffect(() => {
    for (const project of projects) {
      loadGitData(project.id, project.path)
    }
  }, [projects, loadGitData])

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h1 className="text-sm font-medium text-zinc-300">Dashboard</h1>
        <button
          onClick={addProject}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        >
          <Plus size={12} />
          Add Project
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-600">
            <p className="text-sm">No projects yet</p>
            <button
              onClick={addProject}
              className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              <Plus size={12} />
              Add your first project
            </button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(600px, 1fr))' }}>
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
