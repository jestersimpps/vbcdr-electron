import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useGitStore } from '@/stores/git-store'
import { ProjectCard } from '@/components/dashboard/ProjectCard'
import { ProjectModal } from '@/components/dashboard/ProjectModal'
import type { Project } from '@/models/types'

export function Dashboard(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const addProject = useProjectStore((s) => s.addProject)
  const loadGitData = useGitStore((s) => s.loadGitData)
  const [modalProject, setModalProject] = useState<Project | null>(null)

  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  useEffect(() => {
    for (const project of projects) {
      loadGitData(project.id, project.path)
    }
  }, [projects, loadGitData])

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex-1 overflow-hidden p-2">
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
          <div className="grid h-full auto-rows-fr grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2">
            {sorted.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenModal={() => setModalProject(project)}
                isModalOpen={modalProject?.id === project.id}
              />
            ))}
          </div>
        )}
      </div>
      {modalProject && (
        <ProjectModal project={modalProject} onClose={() => setModalProject(null)} />
      )}
    </div>
  )
}
