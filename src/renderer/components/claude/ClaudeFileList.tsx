import { useEffect, useState } from 'react'
import { useClaudeStore } from '@/stores/claude-store'
import { useProjectStore } from '@/stores/project-store'
import { ChevronRight, ChevronDown, File, Globe, Wand2, Terminal, FolderOpen, Webhook, RefreshCw, Trash2 } from 'lucide-react'
import type { ClaudeSection, ClaudeFileEntry } from '@/models/types'
import { FileTree } from '@/components/sidebar/FileTree'

type ViewMode = 'curated' | 'tree'

export type ClaudeScope = 'all' | 'project' | 'global'

const SECTION_CONFIG: { key: ClaudeSection; label: string; Icon: typeof Globe }[] = [
  { key: 'global', label: 'Global', Icon: Globe },
  { key: 'hooks', label: 'Hooks', Icon: Webhook },
  { key: 'skills', label: 'Skills', Icon: Wand2 },
  { key: 'commands', label: 'Commands', Icon: Terminal },
  { key: 'project', label: 'Project', Icon: FolderOpen }
]

function isSectionInScope(section: ClaudeSection, scope: ClaudeScope): boolean {
  if (scope === 'all') return true
  if (scope === 'project') return section === 'project'
  return section !== 'project'
}

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
        <span className="ml-auto text-micro text-zinc-600">{files.length}</span>
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

export function ClaudeFileList({
  projectId,
  scope = 'all',
  rootPath
}: {
  projectId: string
  scope?: ClaudeScope
  rootPath?: string
}): React.ReactElement {
  const activeProject = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const files = useClaudeStore((s) => s.filesPerProject[projectId])
  const activeClaudeFile = useClaudeStore((s) => s.activeFilePerProject[projectId] ?? null)
  const { loadFiles, selectFile } = useClaudeStore()
  const [view, setView] = useState<ViewMode>('curated')

  const effectivePath = scope === 'global' ? rootPath : activeProject?.path

  useEffect(() => {
    if (effectivePath && view === 'curated') {
      loadFiles(projectId, effectivePath)
    }
  }, [projectId, effectivePath, view])

  const handleRefresh = (): void => {
    if (effectivePath) loadFiles(projectId, effectivePath)
  }

  if (!effectivePath) {
    return (
      <div className="p-4 text-center text-xs text-zinc-600">
        {scope === 'global' ? 'Loading…' : 'Select a project'}
      </div>
    )
  }

  const tabBtn = (mode: ViewMode, label: string): React.ReactElement => (
    <button
      onClick={() => setView(mode)}
      className={`flex h-full flex-1 items-center justify-center px-2 text-meta font-medium uppercase tracking-wide transition-colors ${
        view === mode
          ? 'bg-zinc-800 text-zinc-200'
          : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/50">
        {tabBtn('curated', 'Config')}
        {tabBtn('tree', 'Files')}
      </div>
      {view === 'curated' ? (
        <>
          <div className="flex h-9 shrink-0 items-center justify-end border-b border-zinc-800 bg-zinc-900/50 px-3">
            <button
              onClick={handleRefresh}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {SECTION_CONFIG.filter(({ key }) => isSectionInScope(key, scope)).map(({ key, label, Icon }) => (
              <SectionGroup
                key={key}
                section={key}
                label={label}
                Icon={Icon}
                files={(files ?? []).filter((f) => f.section === key)}
                projectId={projectId}
                projectPath={effectivePath}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <FileTree
            projectId={projectId}
            rootOverride={scope === 'global' ? effectivePath : `${effectivePath}/.claude`}
            onFileClick={(path) => selectFile(projectId, path)}
            externalActiveFilePath={activeClaudeFile}
          />
        </div>
      )}
    </div>
  )
}
