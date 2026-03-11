import { GitBranch as GitBranchIcon, FileText, Terminal, FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useGitStore } from '@/stores/git-store'
import { useEditorStore } from '@/stores/editor-store'
import type { Project, GitBranch } from '@/models/types'
import { cn } from '@/lib/utils'

const EMPTY_BRANCHES: GitBranch[] = []
const EMPTY_OUTPUT: string[] = []

const NON_ASCII_RE = /[^\x20-\x7E\t]/g
const MULTI_SPACE_RE = /\s{2,}/g
const NOISE_RE = /^\??\s*for\s+shortcuts\s+\d+\s+tokens?$|^\d+\s*tokens?$|^[>❯›\$]\s*$/

function sanitizeLine(raw: string): string {
  const cleaned = raw.replace(NON_ASCII_RE, ' ').replace(MULTI_SPACE_RE, ' ').trim()
  if (NOISE_RE.test(cleaned)) return ''
  return cleaned
}

interface ProjectCardProps {
  project: Project
}

type ClaudeStatus = 'busy' | 'idle' | 'none'

function useClaudeStatus(projectId: string): ClaudeStatus {
  const tabs = useTerminalStore((s) => s.tabs)
  const statuses = useTerminalStore((s) => s.tabStatuses)
  const llmTabs = tabs.filter((t) => t.projectId === projectId && t.initialCommand)
  if (llmTabs.length === 0) return 'none'
  if (llmTabs.some((t) => statuses[t.id] === 'busy')) return 'busy'
  if (llmTabs.every((t) => statuses[t.id] === 'idle')) return 'idle'
  return 'none'
}

export function ProjectCard({ project }: ProjectCardProps): React.ReactElement {
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const branches = useGitStore((s) => s.branchesPerProject[project.id] ?? EMPTY_BRANCHES)
  const outputBuffer = useTerminalStore((s) => s.outputBufferPerProject[project.id] ?? EMPTY_OUTPUT)
  const openFilesCount = useEditorStore((s) => s.statePerProject[project.id]?.openFiles.length ?? 0)
  const terminalCount = useTerminalStore((s) => s.tabs.filter((t) => t.projectId === project.id).length)
  const claudeStatus = useClaudeStatus(project.id)

  const currentBranch = branches.find((b) => b.current)
  const previewLines = outputBuffer
    .map(sanitizeLine)
    .filter((l) => l.length > 0)
    .slice(-12)

  return (
    <button
      onClick={() => setActiveProject(project.id)}
      className="group flex w-full min-w-0 flex-col gap-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:bg-zinc-800/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen size={16} className="shrink-0 text-zinc-400" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-200">{project.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{project.path}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              claudeStatus === 'busy' && 'animate-pulse bg-amber-400',
              claudeStatus === 'idle' && 'bg-emerald-400',
              claudeStatus === 'none' && 'bg-zinc-600'
            )}
            title={claudeStatus === 'busy' ? 'Claude is working' : claudeStatus === 'idle' ? 'Claude idle' : 'No Claude session'}
          />
        </div>
      </div>

      {currentBranch && (
        <div className="flex items-center gap-1.5">
          <GitBranchIcon size={12} className="text-zinc-500" />
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">
            {currentBranch.name}
          </span>
        </div>
      )}

      {previewLines.length > 0 && (
        <div className="w-full min-w-0 h-40 rounded bg-zinc-950 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-500 overflow-hidden">
          {previewLines.map((line, i) => (
            <div key={i} className="truncate">{line}</div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-zinc-600">
        <span className="flex items-center gap-1">
          <FileText size={11} />
          {openFilesCount} files
        </span>
        <span className="flex items-center gap-1">
          <Terminal size={11} />
          {terminalCount} terminals
        </span>
      </div>
    </button>
  )
}
