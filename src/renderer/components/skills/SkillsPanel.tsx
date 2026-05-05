import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Search, Trash2, RefreshCw, Globe, FolderOpen, Loader2, ExternalLink } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'

interface SkillSearchResult {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

interface SkillSearchResponse {
  query: string
  searchType: string
  skills: SkillSearchResult[]
  count: number
  duration_ms: number
}

interface InstalledSkill {
  name: string
  path: string
  scope: 'project' | 'global'
  description?: string
}

type InstallTarget = 'project' | 'global'
export type SkillsScope = 'all' | 'project' | 'global'

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

interface SkillsPanelProps {
  projectId?: string
  scope?: SkillsScope
}

export function SkillsPanel({ projectId, scope = 'all' }: SkillsPanelProps): React.ReactElement {
  const project = useProjectStore((s) => (projectId ? s.projects.find((p) => p.id === projectId) : undefined))
  const projectPath = project?.path ?? null
  const showProject = scope !== 'global'
  const showGlobal = scope !== 'project'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SkillSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [top, setTop] = useState<SkillSearchResult[]>([])
  const [topLoading, setTopLoading] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)

  const [installed, setInstalled] = useState<InstalledSkill[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [output, setOutput] = useState('')

  const outputRef = useRef<HTMLPreElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshInstalled = useCallback(async () => {
    const list = await window.api.skills.list(projectPath)
    setInstalled(list)
  }, [projectPath])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  useEffect(() => {
    let cancelled = false
    setTopLoading(true)
    setTopError(null)
    window.api.skills
      .top()
      .then((list: SkillSearchResult[]) => {
        if (!cancelled) setTop(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setTopError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setTopLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const off = window.api.skills.onOutput((chunk) => {
      setOutput((prev) => (prev + chunk).slice(-8000))
    })
    return () => {
      off()
    }
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearchError(null)
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res: SkillSearchResponse = await window.api.skills.search(trimmed)
        setResults(res.skills)
        setSearchError(null)
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : String(err))
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const installedNames = useMemo(() => {
    const set = new Set<string>()
    for (const s of installed) set.add(`${s.scope}:${s.name}`)
    return set
  }, [installed])

  const handleInstall = async (result: SkillSearchResult, scope: InstallTarget): Promise<void> => {
    if (scope === 'project' && !projectPath) return
    const key = `${scope}:${result.source}:${result.skillId}`
    setBusyKey(key)
    setOutput((prev) => prev + `\n$ npx skills add ${result.source} -s ${result.skillId} -a claude-code${scope === 'global' ? ' -g' : ''}\n`)
    try {
      const { code } = await window.api.skills.install(result.source, result.skillId, scope, projectPath)
      setOutput((prev) => prev + `\n[exit ${code}]\n`)
      await refreshInstalled()
    } catch (err) {
      setOutput((prev) => prev + `\n[error] ${err instanceof Error ? err.message : String(err)}\n`)
    } finally {
      setBusyKey(null)
    }
  }

  const handleUninstall = async (skill: InstalledSkill): Promise<void> => {
    const key = `uninstall:${skill.scope}:${skill.name}`
    setBusyKey(key)
    setOutput((prev) => prev + `\n$ npx skills remove ${skill.name}${skill.scope === 'global' ? ' -g' : ''}\n`)
    try {
      const { code } = await window.api.skills.uninstall(skill.name, skill.scope, projectPath)
      setOutput((prev) => prev + `\n[exit ${code}]\n`)
      await refreshInstalled()
    } catch (err) {
      setOutput((prev) => prev + `\n[error] ${err instanceof Error ? err.message : String(err)}\n`)
    } finally {
      setBusyKey(null)
    }
  }

  const projectInstalled = installed.filter((s) => s.scope === 'project')
  const globalInstalled = installed.filter((s) => s.scope === 'global')

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={30} minSize={20} maxSize={45}>
        <div className="flex h-full flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 px-2">
            <span className="text-xs font-medium text-zinc-300">Installed</span>
            <button
              onClick={refreshInstalled}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {showProject && (
              <InstalledGroup
                label="Project"
                Icon={FolderOpen}
                items={projectInstalled}
                onUninstall={handleUninstall}
                busyKey={busyKey}
                emptyHint={projectPath ? 'No project skills installed' : 'No project selected'}
              />
            )}
            {showGlobal && (
              <InstalledGroup
                label="Global"
                Icon={Globe}
                items={globalInstalled}
                onUninstall={handleUninstall}
                busyKey={busyKey}
                emptyHint="No global skills installed"
              />
            )}
          </div>
        </div>
      </Panel>
      <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
      <Panel defaultSize={70} minSize={40}>
        <div className="flex h-full flex-col bg-zinc-950">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search skills.sh (e.g. react, testing, deploy)"
                className="w-full rounded border border-zinc-800 bg-zinc-900 py-1 pl-7 pr-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {query.trim().length < 2 && (
              <>
                <div className="flex items-center justify-between px-3 py-1.5 text-micro uppercase tracking-wide text-zinc-500 border-b border-zinc-900">
                  <span>Top on skills.sh</span>
                  <a
                    href="https://skills.sh"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 hover:text-zinc-300"
                  >
                    Browse <ExternalLink size={9} />
                  </a>
                </div>
                {topLoading && top.length === 0 && (
                  <div className="flex items-center justify-center gap-2 p-6 text-xs text-zinc-600">
                    <Loader2 size={12} className="animate-spin" /> Loading top skills…
                  </div>
                )}
                {topError && top.length === 0 && (
                  <div className="p-3 text-xs text-red-400">Error: {topError}</div>
                )}
                {top.map((r) => (
                  <SkillRow
                    key={r.id}
                    skill={r}
                    busyKey={busyKey}
                    installedNames={installedNames}
                    showProject={showProject}
                    showGlobal={showGlobal}
                    projectPath={projectPath}
                    onInstall={handleInstall}
                  />
                ))}
              </>
            )}
            {searchError && query.trim().length >= 2 && (
              <div className="p-3 text-xs text-red-400">Error: {searchError}</div>
            )}
            {!searchError && query.trim().length >= 2 && !searching && results.length === 0 && (
              <div className="p-3 text-xs text-zinc-500">No skills found for &ldquo;{query}&rdquo;</div>
            )}
            {query.trim().length >= 2 && results.map((r) => (
              <SkillRow
                key={r.id}
                skill={r}
                busyKey={busyKey}
                installedNames={installedNames}
                showProject={showProject}
                showGlobal={showGlobal}
                projectPath={projectPath}
                onInstall={handleInstall}
              />
            ))}
          </div>
          {output && (
            <div className="border-t border-zinc-800 bg-black">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-micro uppercase tracking-wide text-zinc-600">Output</span>
                <button
                  onClick={() => setOutput('')}
                  className="text-micro text-zinc-600 hover:text-zinc-400"
                >
                  Clear
                </button>
              </div>
              <pre
                ref={outputRef}
                className="max-h-40 overflow-y-auto px-2 pb-2 text-meta leading-tight text-zinc-400 font-mono whitespace-pre-wrap"
              >
                {output}
              </pre>
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>
  )
}

interface SkillRowProps {
  skill: SkillSearchResult
  busyKey: string | null
  installedNames: Set<string>
  showProject: boolean
  showGlobal: boolean
  projectPath: string | null
  onInstall: (skill: SkillSearchResult, scope: InstallTarget) => void
}

function SkillRow({
  skill,
  busyKey,
  installedNames,
  showProject,
  showGlobal,
  projectPath,
  onInstall
}: SkillRowProps): React.ReactElement {
  const projectKey = `project:${skill.source}:${skill.skillId}`
  const globalKey = `global:${skill.source}:${skill.skillId}`
  const projectBusy = busyKey === projectKey
  const globalBusy = busyKey === globalKey
  const projectInstalled = installedNames.has(`project:${skill.skillId}`)
  const globalInstalled = installedNames.has(`global:${skill.skillId}`)
  return (
    <div className="flex items-start gap-2 border-b border-zinc-900 px-3 py-2 hover:bg-zinc-900/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-200">{skill.name}</span>
          <span className="shrink-0 text-micro text-zinc-600">
            {formatInstalls(skill.installs)} installs
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-meta text-zinc-500">
          <span className="truncate">{skill.source}</span>
          <a
            href={`https://skills.sh/${skill.source}/${skill.skillId}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-0.5 hover:text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {showProject && (
          <button
            onClick={() => onInstall(skill, 'project')}
            disabled={projectBusy || !projectPath}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-meta font-medium transition-colors',
              projectInstalled
                ? 'border border-emerald-900 bg-emerald-950 text-emerald-400 hover:bg-emerald-900/50'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
              (projectBusy || !projectPath) && 'opacity-60 cursor-not-allowed'
            )}
            title={
              !projectPath
                ? 'No project selected'
                : projectInstalled
                  ? 'Already installed in project — click to reinstall'
                  : `Install to ${projectPath}/.claude/skills`
            }
          >
            {projectBusy ? <Loader2 size={10} className="animate-spin" /> : <FolderOpen size={10} />}
            Project
          </button>
        )}
        {showGlobal && (
          <button
            onClick={() => onInstall(skill, 'global')}
            disabled={globalBusy}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-meta font-medium transition-colors',
              globalInstalled
                ? 'border border-emerald-900 bg-emerald-950 text-emerald-400 hover:bg-emerald-900/50'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
              globalBusy && 'opacity-60 cursor-not-allowed'
            )}
            title={
              globalInstalled
                ? 'Already installed globally — click to reinstall'
                : 'Install to ~/.claude/skills'
            }
          >
            {globalBusy ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
            Global
          </button>
        )}
      </div>
    </div>
  )
}

interface InstalledGroupProps {
  label: string
  Icon: typeof Globe
  items: InstalledSkill[]
  onUninstall: (skill: InstalledSkill) => void
  busyKey: string | null
  emptyHint: string
}

function InstalledGroup({ label, Icon, items, onUninstall, busyKey, emptyHint }: InstalledGroupProps): React.ReactElement {
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-meta uppercase tracking-wide text-zinc-500">
        <Icon size={11} />
        <span>{label}</span>
        <span className="ml-auto text-zinc-600">{items.length}</span>
      </div>
      {items.length === 0 && (
        <div className="px-2 py-1 text-meta text-zinc-600">{emptyHint}</div>
      )}
      {items.map((skill) => {
        const key = `uninstall:${skill.scope}:${skill.name}`
        const isBusy = busyKey === key
        return (
          <div
            key={key}
            className="group flex items-start gap-1.5 px-2 py-1 hover:bg-zinc-800/50"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-300">{skill.name}</div>
              {skill.description && (
                <div className="text-micro text-zinc-600">{skill.description}</div>
              )}
            </div>
            <button
              onClick={() => onUninstall(skill)}
              disabled={isBusy}
              className="shrink-0 rounded p-1 text-zinc-600 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100 transition-opacity"
              title="Uninstall"
            >
              {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
