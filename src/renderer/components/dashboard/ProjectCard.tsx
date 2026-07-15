import { GitBranch as GitBranchIcon, FileText, Terminal, ExternalLink, ChevronRight } from 'lucide-react'
import { useTerminalStore } from '@/stores/terminal-store'
import { useGitStore } from '@/stores/git-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useThemeStore } from '@/stores/theme-store'
import { useLayoutStore } from '@/stores/layout-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import type { Project, GitBranch, TerminalTab } from '@/models/types'
import { cn } from '@/lib/utils'

import { formatTokens, tokenBarFill } from '@/lib/token-display'

const EMPTY_BRANCHES: GitBranch[] = []

interface ProjectCardProps {
  project: Project
  onOpenModal: () => void
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

function useProjectTabs(projectId: string): { llmTabs: TerminalTab[]; devTabs: TerminalTab[] } {
  const tabs = useTerminalStore((s) => s.tabs)
  const projectTabs = tabs.filter((t) => t.projectId === projectId)
  return {
    llmTabs: projectTabs.filter((t) => t.initialCommand),
    devTabs: projectTabs.filter((t) => !t.initialCommand)
  }
}

export function ProjectCard({ project, onOpenModal }: ProjectCardProps): React.ReactElement {
  const branches = useGitStore((s) => s.branchesPerProject[project.id] ?? EMPTY_BRANCHES)
  const openFilesCount = useEditorStore((s) => s.statePerProject[project.id]?.openFiles.length ?? 0)
  const claudeStatus = useClaudeStatus(project.id)
  const { llmTabs, devTabs } = useProjectTabs(project.id)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const lastCommandPerTab = useTerminalStore((s) => s.lastCommandPerTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const themeId = useThemeStore((s) => s.getFullThemeId())
  const tokenCap = useLayoutStore((s) => s.tokenCap)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  const theme = getTerminalTheme(themeId)
  const currentBranch = branches.find((b) => b.current)
  const terminalCount = llmTabs.length + devTabs.length

  const openTab = (e: React.MouseEvent, tabId: string): void => {
    e.stopPropagation()
    setActiveTab(project.id, tabId)
    onOpenModal()
  }

  return (
    <div
      className="group relative flex h-full min-h-0 w-full min-w-0 cursor-pointer flex-col overflow-hidden border border-zinc-800 bg-zinc-900/30 text-left transition-colors hover:border-zinc-700"
      onClick={onOpenModal}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-zinc-800 bg-zinc-900/50 px-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span
            className={cn(
              'inline-block h-2 w-2 shrink-0 rounded-full',
              claudeStatus === 'busy' && 'animate-pulse bg-amber-400',
              claudeStatus === 'idle' && 'bg-emerald-400',
              claudeStatus === 'none' && 'bg-zinc-600'
            )}
            title={claudeStatus === 'busy' ? 'Claude is working' : claudeStatus === 'idle' ? 'Claude idle' : 'No Claude session'}
          />
          <span className="truncate font-medium text-zinc-200">{project.name}</span>
          {currentBranch && (
            <>
              <GitBranchIcon size={11} className="shrink-0 text-zinc-600" />
              <span className="truncate font-mono text-meta text-zinc-500">{currentBranch.name}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-meta text-zinc-600">
          <span className="flex items-center gap-1">
            <FileText size={10} />
            {openFilesCount}
          </span>
          <span className="flex items-center gap-1">
            <Terminal size={10} />
            {terminalCount}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setActiveProject(project.id) }}
            title="Open workspace"
            className="flex items-center justify-center rounded p-0.5 text-zinc-600 opacity-0 transition-all hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
          >
            <ExternalLink size={11} />
          </button>
        </div>
      </div>

      {terminalCount === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-zinc-950 text-meta text-zinc-700">
          no session
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-950">
          {llmTabs.map((tab) => {
            const status = tabStatuses[tab.id]
            const tokens = tokenUsagePerTab[tab.id]
            const pct = tokens != null ? Math.min(tokens / tokenCap, 1) : 0
            const fill = tokenBarFill(pct, theme)
            return (
              <div
                key={tab.id}
                className="group/row flex flex-col gap-1.5 border-b border-zinc-800/60 px-2.5 py-2 transition-colors hover:bg-zinc-800/30"
                onClick={(e) => openTab(e, tab.id)}
              >
                <div className="flex items-center gap-1.5 text-meta">
                  <span
                    className={cn(
                      'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                      status === 'busy' && 'animate-pulse bg-amber-400',
                      status === 'idle' && 'bg-emerald-400',
                      !status && 'bg-zinc-600'
                    )}
                  />
                  <span className="truncate font-mono text-zinc-300">{tab.title}</span>
                  <span
                    className={cn(
                      'shrink-0 text-micro',
                      status === 'busy' && 'text-amber-400/80',
                      status === 'idle' && 'text-emerald-400/80',
                      !status && 'text-zinc-600'
                    )}
                  >
                    {status ?? 'starting'}
                  </span>
                  <ChevronRight size={10} className="ml-auto shrink-0 text-zinc-700 opacity-0 transition-opacity group-hover/row:opacity-100" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{ width: `${pct * 100}%`, backgroundColor: fill }}
                    />
                  </div>
                  <span className="shrink-0 tabular-nums text-micro" style={{ color: tokens != null ? `${fill}aa` : undefined }}>
                    {tokens != null ? formatTokens(tokens) : '—'}
                  </span>
                </div>
              </div>
            )
          })}
          {devTabs.map((tab) => {
            const lastCommand = lastCommandPerTab[tab.id]
            return (
              <div
                key={tab.id}
                className="group/row flex items-center gap-1.5 border-b border-zinc-800/60 px-2.5 py-2 text-meta transition-colors hover:bg-zinc-800/30"
                onClick={(e) => openTab(e, tab.id)}
              >
                <Terminal size={10} className="shrink-0 text-zinc-600" />
                <span className="shrink-0 font-mono text-zinc-400">{tab.title}</span>
                <span className="truncate font-mono text-zinc-600">
                  {lastCommand ?? 'no commands yet'}
                </span>
                <ChevronRight size={10} className="ml-auto shrink-0 text-zinc-700 opacity-0 transition-opacity group-hover/row:opacity-100" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
