import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'

type McpScope = 'user' | 'project' | 'local'
type McpTransport = 'stdio' | 'http' | 'sse'
type McpHealth = 'connected' | 'needs-auth' | 'failed'

interface McpServerConfig {
  type?: McpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

interface McpServerEntry {
  name: string
  scope: McpScope
  config: McpServerConfig
  enabled: boolean
}

interface McpStatusEntry {
  name: string
  target: string
  health: McpHealth
  detail: string
}

interface CatalogEntry {
  id: string
  name: string
  description: string
  auth: 'oauth' | 'api-key' | 'none'
  config: McpServerConfig
}

interface FormState {
  editing: { scope: McpScope; name: string } | null
  name: string
  scope: McpScope
  type: McpTransport
  command: string
  args: string
  url: string
  envText: string
  headersText: string
}

const CATALOG: CatalogEntry[] = [
  { id: 'context7', name: 'Context7', description: 'Live library and framework docs', auth: 'none', config: { type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  { id: 'playwright', name: 'Playwright', description: 'Browser automation and testing', auth: 'none', config: { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] } },
  { id: 'chrome-devtools', name: 'Chrome DevTools', description: 'Drive Chrome, read console and network', auth: 'none', config: { type: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] } },
  { id: 'github', name: 'GitHub', description: 'Repos, issues and pull requests', auth: 'oauth', config: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } },
  { id: 'vercel', name: 'Vercel', description: 'Projects, deployments and logs', auth: 'oauth', config: { type: 'http', url: 'https://mcp.vercel.com' } },
  { id: 'supabase', name: 'Supabase', description: 'Projects, tables and SQL', auth: 'api-key', config: { type: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@latest'], env: { SUPABASE_ACCESS_TOKEN: '' } } },
  { id: 'sentry', name: 'Sentry', description: 'Errors and performance issues', auth: 'oauth', config: { type: 'http', url: 'https://mcp.sentry.dev/mcp' } },
  { id: 'linear', name: 'Linear', description: 'Issues, projects and cycles', auth: 'oauth', config: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
  { id: 'notion', name: 'Notion', description: 'Pages and databases', auth: 'oauth', config: { type: 'http', url: 'https://mcp.notion.com/mcp' } },
  { id: 'figma', name: 'Figma', description: 'Designs and dev mode context', auth: 'oauth', config: { type: 'http', url: 'https://mcp.figma.com/mcp' } },
  { id: 'stripe', name: 'Stripe', description: 'Stripe API and documentation', auth: 'oauth', config: { type: 'http', url: 'https://mcp.stripe.com' } },
  { id: 'atlassian', name: 'Atlassian', description: 'Jira and Confluence', auth: 'oauth', config: { type: 'sse', url: 'https://mcp.atlassian.com/v1/sse' } },
  { id: 'cloudflare-docs', name: 'Cloudflare Docs', description: 'Cloudflare documentation search', auth: 'none', config: { type: 'sse', url: 'https://docs.mcp.cloudflare.com/sse' } },
  { id: 'huggingface', name: 'Hugging Face', description: 'Models, datasets and Spaces', auth: 'none', config: { type: 'http', url: 'https://huggingface.co/mcp' } },
  { id: 'firecrawl', name: 'Firecrawl', description: 'Web scraping and crawling', auth: 'api-key', config: { type: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp'], env: { FIRECRAWL_API_KEY: '' } } },
  { id: 'memory', name: 'Memory', description: 'Persistent knowledge graph memory', auth: 'none', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } }
]

const SCOPE_META: Record<McpScope, { label: string; hint: string; Icon: typeof Globe }> = {
  user: { label: 'User', hint: '~/.claude.json — available in every project', Icon: Globe },
  project: { label: 'Project', hint: '.mcp.json — committed to the repo, shared with the team', Icon: FolderOpen },
  local: { label: 'Local', hint: 'This project only, stored in ~/.claude.json', Icon: Laptop }
}

function transportOf(config: McpServerConfig): McpTransport {
  if (config.type) return config.type
  return config.url ? 'http' : 'stdio'
}

function targetOf(config: McpServerConfig): string {
  if (config.url) return config.url
  return [config.command, ...(config.args ?? [])].filter(Boolean).join(' ')
}

function maskSecretText(text: string): string {
  return text.replace(/((?:key|token|secret|password|auth)[^\s=:]*[=:]\s*)\S+/gi, '$1••••••')
}

function parseKeyValueLines(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function toKeyValueLines(record: Record<string, string> | undefined): string {
  if (!record) return ''
  return Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function emptyForm(scope: McpScope): FormState {
  return { editing: null, name: '', scope, type: 'stdio', command: '', args: '', url: '', envText: '', headersText: '' }
}

function HealthBadge({ status }: { status: McpStatusEntry | undefined }): React.ReactElement {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/80 px-2 py-0.5 text-micro text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        Not checked
      </span>
    )
  }
  if (status.health === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-2 py-0.5 text-micro text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Connected
      </span>
    )
  }
  if (status.health === 'needs-auth') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/80 px-2 py-0.5 text-micro text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Needs auth
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-red-950/80 px-2 py-0.5 text-micro text-red-400"
      title={status.detail}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
      Failed
    </span>
  )
}

export function McpPage(): React.ReactElement {
  const activeProject = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
  const projectPath = activeProject?.path ?? null

  const [servers, setServers] = useState<McpServerEntry[] | null>(null)
  const [statusEntries, setStatusEntries] = useState<McpStatusEntry[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.mcp.list(projectPath)
      setServers(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [projectPath])

  const checkHealth = useCallback(async (): Promise<void> => {
    setChecking(true)
    try {
      const entries = await window.api.mcp.status(projectPath)
      setStatusEntries(entries)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }, [projectPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  const statusByName = useMemo(() => {
    const map = new Map<string, McpStatusEntry>()
    for (const entry of statusEntries ?? []) map.set(entry.name, entry)
    return map
  }, [statusEntries])

  const externalStatus = useMemo(() => {
    if (!statusEntries || !servers) return []
    const configured = new Set(servers.map((s) => s.name))
    return statusEntries.filter((entry) => !configured.has(entry.name))
  }, [statusEntries, servers])

  const configuredNames = useMemo(() => new Set((servers ?? []).map((s) => s.name)), [servers])

  const toggleReveal = (key: string): void => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleRemove = async (server: McpServerEntry): Promise<void> => {
    if (!window.confirm(`Remove MCP server "${server.name}" from ${SCOPE_META[server.scope].label.toLowerCase()} scope?`)) return
    const key = `remove:${server.scope}:${server.name}`
    setBusyKey(key)
    try {
      await window.api.mcp.remove(server.scope, projectPath, server.name)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const handleSetEnabled = async (server: McpServerEntry, enabled: boolean): Promise<void> => {
    if (!projectPath) return
    const key = `toggle:${server.name}`
    setBusyKey(key)
    try {
      await window.api.mcp.setEnabled(projectPath, server.name, enabled)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const handleCatalogAdd = async (entry: CatalogEntry, scope: 'user' | 'project'): Promise<void> => {
    if (entry.auth === 'api-key') {
      setForm({
        editing: null,
        name: entry.id,
        scope,
        type: transportOf(entry.config),
        command: entry.config.command ?? '',
        args: (entry.config.args ?? []).join(' '),
        url: entry.config.url ?? '',
        envText: toKeyValueLines(entry.config.env),
        headersText: toKeyValueLines(entry.config.headers)
      })
      return
    }
    const key = `catalog:${scope}:${entry.id}`
    setBusyKey(key)
    try {
      await window.api.mcp.upsert(scope, projectPath, entry.id, entry.config as Record<string, unknown>)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const handleEdit = (server: McpServerEntry): void => {
    setForm({
      editing: { scope: server.scope, name: server.name },
      name: server.name,
      scope: server.scope,
      type: transportOf(server.config),
      command: server.config.command ?? '',
      args: (server.config.args ?? []).join(' '),
      url: server.config.url ?? '',
      envText: toKeyValueLines(server.config.env),
      headersText: toKeyValueLines(server.config.headers)
    })
  }

  const handleSaveForm = async (): Promise<void> => {
    if (!form) return
    const name = form.name.trim()
    if (!name) {
      setError('Server name is required')
      return
    }
    const config: McpServerConfig =
      form.type === 'stdio'
        ? {
            type: 'stdio',
            command: form.command.trim(),
            args: form.args.trim() ? form.args.trim().split(/\s+/) : undefined,
            env: parseKeyValueLines(form.envText)
          }
        : {
            type: form.type,
            url: form.url.trim(),
            headers: parseKeyValueLines(form.headersText)
          }
    if (form.type === 'stdio' && !config.command) {
      setError('Command is required for stdio servers')
      return
    }
    if (form.type !== 'stdio' && !config.url) {
      setError('URL is required for remote servers')
      return
    }
    setBusyKey('form:save')
    try {
      if (form.editing && (form.editing.name !== name || form.editing.scope !== form.scope)) {
        await window.api.mcp.remove(form.editing.scope, projectPath, form.editing.name)
      }
      await window.api.mcp.upsert(form.scope, projectPath, name, config as Record<string, unknown>)
      setForm(null)
      setError(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const handleAuthenticate = async (name: string): Promise<void> => {
    setAuthBusy(name)
    setError(null)
    try {
      const { code, output } = await window.api.mcp.login(projectPath, name)
      if (code !== 0) {
        const tail = output.trim().split('\n').slice(-2).join(' · ')
        setError(`Authentication for "${name}" did not complete${tail ? `: ${tail}` : ''}`)
      }
      await checkHealth()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAuthBusy(null)
    }
  }

  const handleLogout = async (name: string): Promise<void> => {
    setAuthBusy(name)
    setError(null)
    try {
      const { code, output } = await window.api.mcp.logout(projectPath, name)
      if (code !== 0) {
        const tail = output.trim().split('\n').slice(-2).join(' · ')
        setError(`Logout for "${name}" failed${tail ? `: ${tail}` : ''}`)
      }
      await checkHealth()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAuthBusy(null)
    }
  }

  const grouped = useMemo(() => {
    const scopes: McpScope[] = ['user', 'project', 'local']
    return scopes
      .map((scope) => ({ scope, items: (servers ?? []).filter((s) => s.scope === scope) }))
      .filter((group) => group.scope === 'user' || group.items.length > 0)
  }, [servers])

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4">
        <div className="flex items-center gap-2">
          <Plug size={16} className="text-zinc-400" />
          <h1 className="text-sm font-semibold">MCP Servers</h1>
          {servers && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-micro text-zinc-400">{servers.length}</span>
          )}
          <span className="ml-2 text-micro text-zinc-600">Changes apply to new Claude sessions</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void checkHealth()}
            disabled={checking}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            title="Runs `claude mcp list` to verify each server connects"
          >
            {checking ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
            {checking ? 'Checking…' : 'Check health'}
          </button>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            title="Reload configuration files"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            onClick={() => setForm(emptyForm('user'))}
            className="flex items-center gap-1.5 rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Plus size={12} />
            Add server
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 flex items-center justify-between rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <X size={12} />
            </button>
          </div>
        )}

        <div className="space-y-6">
          {grouped.map(({ scope, items }) => {
            const meta = SCOPE_META[scope]
            return (
              <div key={scope}>
                <div className="mb-1.5 flex items-center gap-1.5 text-meta uppercase tracking-wide text-zinc-500">
                  <meta.Icon size={11} />
                  {meta.label}
                  <span className="normal-case tracking-normal text-zinc-600">— {meta.hint}</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-zinc-800">
                  {items.length === 0 && (
                    <div className="px-3 py-3 text-xs text-zinc-600">No servers configured</div>
                  )}
                  {items.map((server) => {
                    const revealKey = `${server.scope}:${server.name}`
                    const isRevealed = revealed.has(revealKey)
                    const status = statusByName.get(server.name)
                    const target = targetOf(server.config)
                    const transport = transportOf(server.config)
                    const env = server.config.env ?? {}
                    const envKeys = Object.keys(env)
                    return (
                      <div
                        key={revealKey}
                        className={cn(
                          'flex items-center gap-3 border-b border-zinc-800 px-3 py-2.5 last:border-b-0 hover:bg-zinc-900/40',
                          !server.enabled && 'opacity-50'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-zinc-200">{server.name}</span>
                            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-px font-mono text-micro uppercase text-zinc-400">
                              {transport}
                            </span>
                            {!server.enabled && (
                              <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-px text-micro text-zinc-500">disabled</span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-meta text-zinc-500" title={isRevealed ? target : undefined}>
                            {isRevealed ? target : maskSecretText(target)}
                          </div>
                          {envKeys.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {envKeys.map((key) => (
                                <span key={key} className="rounded bg-zinc-900 px-1.5 py-px font-mono text-micro text-zinc-500">
                                  {key}={isRevealed ? env[key] : '••••••'}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <HealthBadge status={status} />
                        <div className="flex shrink-0 items-center gap-0.5">
                          {(envKeys.length > 0 || target !== maskSecretText(target)) && (
                            <button
                              onClick={() => toggleReveal(revealKey)}
                              className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                              title={isRevealed ? 'Hide secrets' : 'Reveal secrets'}
                            >
                              {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          )}
                          {(status?.health === 'needs-auth' || (transport !== 'stdio' && status?.health === 'failed')) && (
                            <button
                              onClick={() => void handleAuthenticate(server.name)}
                              disabled={authBusy !== null}
                              className="flex items-center gap-1 rounded px-2 py-1 text-meta font-medium text-amber-400 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Opens your browser to authenticate (claude mcp login)"
                            >
                              {authBusy === server.name ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                              {authBusy === server.name ? 'Waiting for browser…' : 'Authenticate'}
                            </button>
                          )}
                          {transport !== 'stdio' && status?.health === 'connected' && (
                            <button
                              onClick={() => void handleLogout(server.name)}
                              disabled={authBusy !== null}
                              className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                              title="Clear stored OAuth credentials (claude mcp logout)"
                            >
                              {authBusy === server.name ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                            </button>
                          )}
                          {server.scope === 'project' && (
                            <button
                              onClick={() => void handleSetEnabled(server, !server.enabled)}
                              disabled={busyKey === `toggle:${server.name}` || !projectPath}
                              className="rounded px-2 py-1 text-meta text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                              title={server.enabled ? 'Disable for this project' : 'Enable for this project'}
                            >
                              {server.enabled ? 'Disable' : 'Enable'}
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(server)}
                            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => void handleRemove(server)}
                            disabled={busyKey === `remove:${server.scope}:${server.name}`}
                            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
                            title="Remove"
                          >
                            {busyKey === `remove:${server.scope}:${server.name}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {externalStatus.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-meta uppercase tracking-wide text-zinc-500">
                <Plug size={11} />
                Connectors & plugins
                <span className="normal-case tracking-normal text-zinc-600">
                  — managed by claude.ai or Claude Code plugins, not editable here
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                {externalStatus.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-300">{entry.name}</div>
                      <div className="mt-0.5 truncate font-mono text-meta text-zinc-500">{maskSecretText(entry.target)}</div>
                    </div>
                    <HealthBadge status={entry} />
                    {entry.health === 'needs-auth' && (
                      <button
                        onClick={() => void handleAuthenticate(entry.name)}
                        disabled={authBusy !== null}
                        className="flex items-center gap-1 rounded px-2 py-1 text-meta font-medium text-amber-400 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Opens your browser to authenticate (claude mcp login)"
                      >
                        {authBusy === entry.name ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                        {authBusy === entry.name ? 'Waiting for browser…' : 'Authenticate'}
                      </button>
                    )}
                    {entry.health === 'connected' && (
                      <button
                        onClick={() => void handleLogout(entry.name)}
                        disabled={authBusy !== null}
                        className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                        title="Clear stored OAuth credentials (claude mcp logout)"
                      >
                        {authBusy === entry.name ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-meta uppercase tracking-wide text-zinc-500">
              <Plus size={11} />
              Popular servers
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {CATALOG.map((entry) => {
                const installed = configuredNames.has(entry.id)
                return (
                  <div key={entry.id} className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">{entry.name}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-px font-mono text-micro uppercase text-zinc-500">
                          {transportOf(entry.config)}
                        </span>
                        {entry.auth === 'oauth' && (
                          <span className="rounded bg-amber-950/60 px-1.5 py-px text-micro text-amber-500">OAuth</span>
                        )}
                        {entry.auth === 'api-key' && (
                          <span className="rounded bg-sky-950/60 px-1.5 py-px text-micro text-sky-400">API key</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-meta text-zinc-500">{entry.description}</div>
                    </div>
                    {installed ? (
                      <span className="flex shrink-0 items-center gap-1 rounded border border-emerald-900 bg-emerald-950 px-2 py-1 text-meta text-emerald-400">
                        <Check size={10} />
                        Added
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => void handleCatalogAdd(entry, 'user')}
                          disabled={busyKey === `catalog:user:${entry.id}`}
                          className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-meta font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
                          title="Add for all projects (~/.claude.json)"
                        >
                          {busyKey === `catalog:user:${entry.id}` ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Globe size={10} />
                          )}
                          User
                        </button>
                        <button
                          onClick={() => void handleCatalogAdd(entry, 'project')}
                          disabled={busyKey === `catalog:project:${entry.id}` || !projectPath}
                          className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-meta font-medium text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                          title={projectPath ? 'Add to this project (.mcp.json)' : 'No project selected'}
                        >
                          {busyKey === `catalog:project:${entry.id}` ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <FolderOpen size={10} />
                          )}
                          Project
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {form && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <span className="text-sm font-semibold text-zinc-200">
                {form.editing ? `Edit ${form.editing.name}` : 'Add MCP server'}
              </span>
              <button onClick={() => setForm(null)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex gap-3">
                <label className="flex-1 text-xs text-zinc-400">
                  Name
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="my-server"
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                  />
                </label>
                <label className="w-32 text-xs text-zinc-400">
                  Scope
                  <select
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value as McpScope })}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  >
                    <option value="user">User</option>
                    <option value="project" disabled={!projectPath}>Project</option>
                    <option value="local" disabled={!projectPath}>Local</option>
                  </select>
                </label>
                <label className="w-28 text-xs text-zinc-400">
                  Transport
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as McpTransport })}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  >
                    <option value="stdio">stdio</option>
                    <option value="http">http</option>
                    <option value="sse">sse</option>
                  </select>
                </label>
              </div>

              {form.type === 'stdio' ? (
                <>
                  <div className="flex gap-3">
                    <label className="w-40 text-xs text-zinc-400">
                      Command
                      <input
                        value={form.command}
                        onChange={(e) => setForm({ ...form, command: e.target.value })}
                        placeholder="npx"
                        className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                      />
                    </label>
                    <label className="flex-1 text-xs text-zinc-400">
                      Arguments
                      <input
                        value={form.args}
                        onChange={(e) => setForm({ ...form, args: e.target.value })}
                        placeholder="-y some-mcp-package@latest"
                        className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-zinc-400">
                    Environment variables <span className="text-zinc-600">(one KEY=value per line)</span>
                    <textarea
                      value={form.envText}
                      onChange={(e) => setForm({ ...form, envText: e.target.value })}
                      rows={3}
                      placeholder={'API_KEY=sk-...'}
                      className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-xs text-zinc-400">
                    URL
                    <input
                      value={form.url}
                      onChange={(e) => setForm({ ...form, url: e.target.value })}
                      placeholder="https://mcp.example.com/mcp"
                      className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Headers <span className="text-zinc-600">(one KEY=value per line, optional)</span>
                    <textarea
                      value={form.headersText}
                      onChange={(e) => setForm({ ...form, headersText: e.target.value })}
                      rows={2}
                      placeholder={'Authorization=Bearer ...'}
                      className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                    />
                  </label>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
              <button
                onClick={() => setForm(null)}
                className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveForm()}
                disabled={busyKey === 'form:save'}
                className="flex items-center gap-1.5 rounded bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-60"
              >
                {busyKey === 'form:save' && <Loader2 size={12} className="animate-spin" />}
                {form.editing ? 'Save changes' : 'Add server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
