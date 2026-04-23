import { useState } from 'react'
import { GitBranch as GitBranchIcon, FileText, Terminal, Zap } from 'lucide-react'
import { useTerminalStore } from '@/stores/terminal-store'
import { useGitStore } from '@/stores/git-store'
import { useEditorStore } from '@/stores/editor-store'
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

export function ProjectCard({ project, onOpenModal, isModalOpen }: ProjectCardProps): React.ReactElement {
  const branches = useGitStore((s) => s.branchesPerProject[project.id] ?? EMPTY_BRANCHES)
  const outputBuffer = useTerminalStore((s) => s.outputBufferPerProject[project.id] ?? EMPTY_OUTPUT)
  const openFilesCount = useEditorStore((s) => s.statePerProject[project.id]?.openFiles.length ?? 0)
  const terminalCount = useTerminalStore((s) => s.tabs.filter((t) => t.projectId === project.id).length)
  const claudeStatus = useClaudeStatus(project.id)
  const llmTabs = useLlmTabs(project.id)
  const tabStatuses = useTerminalStore((s) => s.tabStatuses)
  const tokenUsagePerTab = useTerminalStore((s) => s.tokenUsagePerTab)
  const themeId = useThemeStore((s) => s.getFullThemeId())
  const tokenCap = useLayoutStore((s) => s.tokenCap)
  const accentColor = getTerminalTheme(themeId).cursor ?? '#58a6ff'
  const [activeIndex, setActiveIndex] = useState(0)

  const clampedIndex = Math.min(activeIndex, Math.max(llmTabs.length - 1, 0))
  const activeTab = llmTabs[clampedIndex] ?? null
  const hasTerminal = activeTab ? !!getTerminalInstance(activeTab.id) : false

  const currentBranch = branches.find((b) => b.current)
  const previewLines = outputBuffer
    .map(sanitizeLine)
    .filter((l) => l.length > 0)
    .slice(-12)

  return (
    <div
      className="group flex w-full min-w-0 cursor-pointer flex-col gap-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition-all hover:bg-zinc-800/50"
      onClick={onOpenModal}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'inline-block h-2 w-2 shrink-0 rounded-full',
              claudeStatus === 'busy' && 'animate-pulse bg-amber-400',
              claudeStatus === 'idle' && 'bg-emerald-400',
              claudeStatus === 'none' && 'bg-zinc-600'
            )}
            title={claudeStatus === 'busy' ? 'Claude is working' : claudeStatus === 'idle' ? 'Claude idle' : 'No Claude session'}
          />
          <span className="truncate text-sm font-medium text-zinc-200">{project.name}</span>
          {currentBranch && (
            <>
              <GitBranchIcon size={11} className="shrink-0 text-zinc-600" />
              <span className="truncate text-[11px] font-mono text-zinc-500">{currentBranch.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1">
            <FileText size={10} />
            {openFilesCount}
          </span>
          <span className="flex items-center gap-1">
            <Terminal size={10} />
            {terminalCount}
          </span>
        </div>
      </div>

      {hasTerminal && activeTab && !isModalOpen ? (
        <div className="flex w-full min-w-0 flex-col gap-1">
          {llmTabs.length > 1 && (
            <div className="flex items-center gap-1">
              {llmTabs.map((tab, i) => {
                const status = tabStatuses[tab.id]
                return (
                  <button
                    key={tab.id}
                    onClick={(e) => { e.stopPropagation(); setActiveIndex(i) }}
                    className={cn(
                      'flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono transition-colors',
                      i !== clampedIndex && 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400'
                    )}
                    style={i === clampedIndex ? { backgroundColor: `${accentColor}20`, color: accentColor } : undefined}
                  >
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                        status === 'busy' && 'animate-pulse bg-amber-400',
                        status === 'idle' && 'bg-emerald-400',
                        (!status || status === 'none') && 'bg-zinc-600'
                      )}
                    />
                    {tab.title}
                  </button>
                )
              })}
            </div>
          )}
          <div className="w-full min-w-0 h-80 overflow-hidden rounded">
            <DashboardTerminal tabId={activeTab.id} />
          </div>
        </div>
      ) : previewLines.length > 0 ? (
        <div className="w-full min-w-0 h-80 rounded bg-zinc-950 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-500 overflow-hidden">
          {previewLines.map((line, i) => (
            <div key={i} className="truncate">{line}</div>
          ))}
        </div>
      ) : null}

      {activeTab && tokenUsagePerTab[activeTab.id] != null && (() => {
        const tokens = tokenUsagePerTab[activeTab.id]
        const pct = Math.min(tokens / tokenCap, 1)
        const theme = getTerminalTheme(themeId)
        const fill = tokenBarFill(pct, theme)
        return (
          <div className="flex items-center gap-2 px-0.5">
            <Zap size={9} className="shrink-0" style={{ color: `${fill}80` }} />
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{ width: `${pct * 100}%`, backgroundColor: fill }}
              />
            </div>
            <span className="shrink-0 text-[9px] tabular-nums" style={{ color: `${fill}aa` }}>
              {formatTokens(tokens)}
            </span>
          </div>
        )
      })()}

    </div>
  )
}
