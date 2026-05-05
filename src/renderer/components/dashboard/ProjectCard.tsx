import { GitBranch as GitBranchIcon, FileText, Terminal, Zap, ExternalLink } from 'lucide-react'
import { useTerminalStore } from '@/stores/terminal-store'
import { useGitStore } from '@/stores/git-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useThemeStore } from '@/stores/theme-store'
import { useLayoutStore } from '@/stores/layout-store'
import { getTerminalTheme } from '@/config/terminal-theme-registry'
import { getTerminalInstance } from '@/components/terminal/TerminalInstance'
import { DashboardTerminal } from '@/components/dashboard/DashboardTerminal'
import type { Project, GitBranch, TerminalTab } from '@/models/types'
import { cn } from '@/lib/utils'

const EMPTY_BRANCHES: GitBranch[] = []
const EMPTY_OUTPUT: string[] = []

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function tokenBarFill(pct: number, theme: { green?: string; yellow?: string; red?: string }): string {
  if (pct < 0.5) return theme.green ?? '#7ee787'
  if (pct < 0.75) return theme.yellow ?? '#ffa657'
  return theme.red ?? '#ff7b72'
}

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
  onOpenModal: () => void
  isModalOpen: boolean
  maxColSpan: number
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

function useLlmTabs(projectId: string): TerminalTab[] {
  const tabs = useTerminalStore((s) => s.tabs)
  return tabs.filter((t) => t.projectId === projectId && t.initialCommand)
}

export function ProjectCard({ project, onOpenModal, isModalOpen, maxColSpan }: ProjectCardProps): React.ReactElement {
  const branches = useGitStore((s) => s.branchesPerProject[project.id] ?? EMPTY_BRANCHES)
  const outputBuffer = useTerminalStore((s) => s.outputBufferPerProject[project.id] ?? EMPTY_OUTPUT)
  const openFilesCount = useEditorStore((s) => s.statePerProject[project.id]?.openFiles.length ?? 0)
  const terminalCount = useTerminalStore((s) => s.tabs.filter((t) => t.projectId === project.id).length)
  const claudeStatus = useClaudeStatus(project.id)
  const llmTabs = useLlmTabs(project.id)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const themeId = useThemeStore((s) => s.getFullThemeId())
  const tokenCap = useLayoutStore((s) => s.tokenCap)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  const currentBranch = branches.find((b) => b.current)
  const previewLines = outputBuffer
    .map(sanitizeLine)
    .filter((l) => l.length > 0)
    .slice(-12)

  const span = Math.max(1, Math.min(llmTabs.length || 1, Math.max(1, maxColSpan)))

  return (
    <div
      className="group relative flex h-full min-h-0 w-full min-w-0 cursor-pointer flex-col overflow-hidden border border-zinc-800 bg-zinc-900/30 text-left transition-colors hover:border-zinc-700"
      style={span > 1 ? { gridColumn: `span ${span} / span ${span}` } : undefined}
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

      {llmTabs.length > 0 ? (
        <div
          className="grid flex-1 min-h-0 auto-rows-fr"
          style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
        >
          {llmTabs.map((tab, i) => {
            const status = tabStatuses[tab.id]
            const hasInstance = !!getTerminalInstance(tab.id)
            const tokens = tokenUsagePerTab[tab.id]
            const theme = getTerminalTheme(themeId)
            const pct = tokens != null ? Math.min(tokens / tokenCap, 1) : 0
            const fill = tokenBarFill(pct, theme)
            const col = i % span
            const row = Math.floor(i / span)
            return (
              <div
                key={tab.id}
                className={cn(
                  'group/pane relative flex min-w-0 min-h-0 flex-col transition-colors hover:bg-zinc-800/30',
                  col > 0 && 'border-l border-zinc-800',
                  row > 0 && 'border-t border-zinc-800'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveTab(project.id, tab.id)
                  onOpenModal()
                }}
              >
                <div className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity group-hover/pane:opacity-100" style={{ boxShadow: 'inset 0 0 0 1px rgb(96 165 250)' }} />
                <div className="flex h-7 shrink-0 items-center justify-between gap-1.5 border-b border-zinc-800 bg-zinc-900/30 px-2 text-meta">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                        status === 'busy' && 'animate-pulse bg-amber-400',
                        status === 'idle' && 'bg-emerald-400',
                        !status && 'bg-zinc-600'
                      )}
                    />
                    <span className="truncate font-mono text-zinc-400">{tab.title}</span>
                  </div>
                  {tokens != null && (
                    <span className="shrink-0 tabular-nums text-micro" style={{ color: `${fill}aa` }}>
                      {formatTokens(tokens)}
                    </span>
                  )}
                </div>
                <div className="relative flex-1 min-h-0 bg-zinc-950">
                  {hasInstance && !isModalOpen ? (
                    <DashboardTerminal tabId={tab.id} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-meta text-zinc-700">
                      starting…
                    </div>
                  )}
                </div>
                {tokens != null && (
                  <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800 bg-zinc-900/40 px-2 py-1">
                    <Zap size={9} className="shrink-0" style={{ color: `${fill}80` }} />
                    <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                        style={{ width: `${pct * 100}%`, backgroundColor: fill }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : previewLines.length > 0 ? (
        <div className="flex-1 min-h-0 overflow-hidden bg-zinc-950 px-2.5 py-2 font-mono text-meta leading-relaxed text-zinc-500">
          {previewLines.map((line, i) => (
            <div key={i} className="truncate">{line}</div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-zinc-950 text-meta text-zinc-700">
          no session
        </div>
      )}
    </div>
  )
}
