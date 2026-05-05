import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Server, Skull, X, FolderOpen, Filter } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'

interface DevServer {
  pid: number
  port: number
  command: string
  process: string
  cwd: string | null
  user: string
  startedAt: number | null
  cpu: number | null
  memoryMB: number | null
}

const REFRESH_MS = 3000

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function formatMemory(mb: number | null): string {
  if (mb === null) return '—'
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatCpu(cpu: number | null): string {
  if (cpu === null) return '—'
  if (cpu < 10) return `${cpu.toFixed(1)}%`
  return `${Math.round(cpu)}%`
}

function MetricBar({
  value,
  max,
  color
}: {
  value: number | null
  max: number
  color: string
}): React.ReactElement {
  const pct = value === null ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="relative h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
      <div
        className={cn('absolute inset-y-0 left-0 rounded-full transition-all', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function shortenCwd(cwd: string | null): string {
  if (!cwd) return '—'
  const posixHome = cwd.match(/^\/Users\/[^/]+/)?.[0] ?? cwd.match(/^\/home\/[^/]+/)?.[0]
  if (posixHome) return cwd.replace(posixHome, '~')
  const winHome = cwd.match(/^[A-Za-z]:\\Users\\[^\\]+/)?.[0]
  if (winHome) return cwd.replace(winHome, '~')
  return cwd
}

function isProjectLike(server: DevServer): boolean {
  if (!server.cwd) return false
  const cwd = server.cwd
  // Windows
  if (/^[A-Za-z]:\\/.test(cwd)) {
    const lower = cwd.toLowerCase()
    if (!lower.includes('\\users\\')) return false
    if (lower.includes('\\appdata\\')) return false
    if (lower.includes('\\windows\\')) return false
    if (lower.includes('\\program files')) return false
    return true
  }
  // POSIX
  if (cwd === '/') return false
  if (!cwd.startsWith('/Users/') && !cwd.startsWith('/home/')) return false
  if (cwd.includes('/Library/Containers')) return false
  if (cwd.includes('/Library/Application Support')) return false
  return true
}

export function DevServersPage(): React.ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const [servers, setServers] = useState<DevServer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [killing, setKilling] = useState<Set<number>>(new Set())
  const [filterProjects, setFilterProjects] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await window.api.devServers.list()
      setServers(list)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const handleKill = useCallback(
    async (pid: number, force = false): Promise<void> => {
      setKilling((prev) => new Set(prev).add(pid))
      try {
        await window.api.devServers.kill(pid, force)
        setTimeout(() => {
          void refresh()
          setKilling((prev) => {
            const next = new Set(prev)
            next.delete(pid)
            return next
          })
        }, 400)
      } catch {
        setKilling((prev) => {
          const next = new Set(prev)
          next.delete(pid)
          return next
        })
      }
    },
    [refresh]
  )

  const visible = useMemo(() => {
    if (!servers) return null
    if (!filterProjects) return servers
    return servers.filter(isProjectLike)
  }, [servers, filterProjects])

  const groupedByProject = useMemo(() => {
    if (!visible) return new Map<string, DevServer[]>()
    const map = new Map<string, DevServer[]>()
    for (const server of visible) {
      const projectMatch = projects.find((p) => {
        if (!server.cwd) return false
        if (server.cwd === p.path) return true
        const sep = /^[A-Za-z]:\\/.test(p.path) ? '\\' : '/'
        return server.cwd.startsWith(p.path + sep)
      })
      const key = projectMatch ? projectMatch.name : shortenCwd(server.cwd)
      const existing = map.get(key) ?? []
      existing.push(server)
      map.set(key, existing)
    }
    return map
  }, [visible, projects])

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-zinc-400" />
          <h1 className="text-sm font-semibold">Dev Servers</h1>
          {visible && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-400">
              {visible.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterProjects((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
              filterProjects
                ? 'bg-zinc-800 text-zinc-200'
                : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
            )}
            title={filterProjects ? 'Showing project servers only' : 'Showing all listening processes'}
          >
            <Filter size={12} />
            {filterProjects ? 'Projects only' : 'All listeners'}
          </button>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            title="Refresh"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {visible === null && !error && (
          <div className="text-xs text-zinc-500">Scanning…</div>
        )}

        {visible && visible.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Server size={32} className="mb-3 text-zinc-700" />
            <div className="text-sm text-zinc-400">No dev servers found</div>
            <div className="mt-1 text-xs text-zinc-600">
              {filterProjects
                ? 'Toggle "All listeners" to see system processes too.'
                : 'Nothing is listening on a TCP port.'}
            </div>
          </div>
        )}

        {visible && visible.length > 0 && (
          <div className="space-y-4">
            {Array.from(groupedByProject.entries()).map(([groupName, groupServers]) => (
              <div key={groupName}>
                <div className="mb-1.5 flex items-center gap-1.5 text-meta uppercase tracking-wide text-zinc-500">
                  <FolderOpen size={11} />
                  {groupName}
                </div>
                <div className="overflow-hidden rounded-lg border border-zinc-800">
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col className="w-[80px]" />
                      <col className="w-[100px]" />
                      <col />
                      <col className="w-[140px]" />
                      <col className="w-[160px]" />
                      <col className="w-[80px]" />
                      <col className="w-[90px]" />
                      <col className="w-[200px]" />
                    </colgroup>
                    <thead className="bg-zinc-900/60 text-micro uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Port</th>
                        <th className="px-3 py-2 text-left font-medium">Process</th>
                        <th className="px-3 py-2 text-left font-medium">Command</th>
                        <th className="px-3 py-2 text-left font-medium">CPU</th>
                        <th className="px-3 py-2 text-left font-medium">Memory</th>
                        <th className="px-3 py-2 text-left font-medium">PID</th>
                        <th className="px-3 py-2 text-left font-medium">Uptime</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupServers.map((server) => {
                        const isKilling = killing.has(server.pid)
                        return (
                          <tr
                            key={`${server.pid}-${server.port}`}
                            className={cn(
                              'border-t border-zinc-800 transition-colors',
                              isKilling
                                ? 'bg-red-950/30 opacity-60'
                                : 'hover:bg-zinc-900/40'
                            )}
                          >
                            <td className="px-3 py-2 font-mono font-medium text-emerald-400">
                              {server.port}
                            </td>
                            <td className="px-3 py-2 font-mono text-zinc-300">
                              {server.process}
                            </td>
                            <td className="px-3 py-2">
                              <div
                                className="truncate font-mono text-zinc-400"
                                title={server.command}
                              >
                                {server.command}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <MetricBar
                                  value={server.cpu}
                                  max={100}
                                  color="bg-amber-500/70"
                                />
                                <span className="font-mono text-meta tabular-nums text-zinc-400">
                                  {formatCpu(server.cpu)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <MetricBar
                                  value={server.memoryMB}
                                  max={2048}
                                  color="bg-sky-500/70"
                                />
                                <span className="font-mono text-meta tabular-nums text-zinc-400">
                                  {formatMemory(server.memoryMB)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-mono text-zinc-500">{server.pid}</td>
                            <td className="px-3 py-2 text-zinc-500">
                              {formatUptime(server.startedAt)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    const open = window.api.devServers.open
                                    if (typeof open !== 'function') {
                                      setError('Restart vbcdr — preload script is out of date.')
                                      return
                                    }
                                    open(server.port).catch((e) => setError(`Open failed: ${e}`))
                                  }}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-meta text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                  title={`Open http://localhost:${server.port}`}
                                >
                                  <ExternalLink size={11} />
                                  Open
                                </button>
                                <button
                                  onClick={() => void handleKill(server.pid, false)}
                                  disabled={isKilling}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-meta text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="SIGTERM (graceful)"
                                >
                                  <X size={11} />
                                  Kill
                                </button>
                                <button
                                  onClick={() => void handleKill(server.pid, true)}
                                  disabled={isKilling}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-meta text-red-400 hover:bg-red-950/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="SIGKILL (force)"
                                >
                                  <Skull size={11} />
                                  Force
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
