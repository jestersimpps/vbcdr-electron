import { useEffect } from 'react'
import { useClaudeStore } from '@/stores/claude-store'
import { useProjectStore } from '@/stores/project-store'
import { ChevronRight, ChevronDown, File, Globe, Wand2, Terminal, FolderOpen, Webhook, RefreshCw, Trash2 } from 'lucide-react'
import type { ClaudeSection, ClaudeFileEntry } from '@/models/types'

const SECTION_CONFIG: { key: ClaudeSection; label: string; Icon: typeof Globe }[] = [
  { key: 'global', label: 'Global', Icon: Globe },
  { key: 'hooks', label: 'Hooks', Icon: Webhook },
  { key: 'skills', label: 'Skills', Icon: Wand2 },
  { key: 'commands', label: 'Commands', Icon: Terminal },
  { key: 'project', label: 'Project', Icon: FolderOpen }
]

function SectionGroup({
  section,
  label,
  Icon,
  files,
  projectId,
  projectPath
}: {
  section: ClaudeSection
  label: string
  Icon: typeof Globe
  files: ClaudeFileEntry[]
  projectId: string
  projectPath: string
}): React.ReactElement {
  const expanded = useClaudeStore((s) => s.expandedSections[projectId]?.has(section) ?? true)
  const activeFile = useClaudeStore((s) => s.activeFilePerProject[projectId])
  const { toggleSection, selectFile, deleteFile } = useClaudeStore()

  if (files.length === 0) return <></>

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 text-sm text-zinc-300 hover:bg-zinc-800/50"
        onClick={() => toggleSection(projectId, section)}
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-zinc-500" />
        )}
        <Icon size={14} className="shrink-0 text-zinc-500" />
        <span className="truncate font-medium">{label}</span>
        <span className="ml-auto text-[10px] text-zinc-600">{files.length}</span>
      </div>
      {expanded &&
        files.map((file) => {
          const isActive = file.path === activeFile
          return (
            <div
              key={file.path}
              className={`group flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm hover:bg-zinc-800/50 ${
                isActive ? 'bg-zinc-800/70 text-zinc-200' : 'text-zinc-400'
              }`}
              style={{ paddingLeft: '28px' }}
              onClick={() => selectFile(projectId, file.path)}
            >
              <File size={14} className="shrink-0 text-zinc-600" />
              <span className="flex-1 truncate">{file.name}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  deleteFile(projectId, file.path, projectPath)
                }}
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100 transition-opacity"
                title="Delete file"
              >
                <Trash2 size={12} />
              </span>
            </div>
          )
        })}
    </div>
  )
}

export function ClaudeFileList({ projectId }: { projectId: string }): React.ReactElement {
  const activeProject = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const files = useClaudeStore((s) => s.filesPerProject[projectId])
  const { loadFiles } = useClaudeStore()

  useEffect(() => {
    if (activeProject) {
      loadFiles(projectId, activeProject.path)
    }
  }, [projectId])

  const handleRefresh = (): void => {
    if (activeProject) loadFiles(projectId, activeProject.path)
  }

  if (!activeProject) {
    return <div className="p-4 text-center text-xs text-zinc-600">Select a project</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Claude Config</span>
        <button
          onClick={handleRefresh}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {SECTION_CONFIG.map(({ key, label, Icon }) => (
          <SectionGroup
            key={key}
            section={key}
            label={label}
            Icon={Icon}
            files={(files ?? []).filter((f) => f.section === key)}
            projectId={projectId}
            projectPath={activeProject.path}
          />
        ))}
      </div>
    </div>
  )
}
