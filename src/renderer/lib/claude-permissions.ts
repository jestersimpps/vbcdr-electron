export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | 'auto' | 'dontAsk'
export type RuleBucket = 'allow' | 'ask' | 'deny'

export interface ClaudePermissionsBlock {
  allow?: string[]
  ask?: string[]
  deny?: string[]
  defaultMode?: PermissionMode
  additionalDirectories?: string[]
  disableBypassPermissionsMode?: 'disable'
  disableAutoMode?: 'disable'
}

export interface StashedRules {
  allow?: string[]
  ask?: string[]
  deny?: string[]
}

export interface ClaudeSettings {
  permissions?: ClaudePermissionsBlock
  _vbcdrStashedRules?: StashedRules
  [key: string]: unknown
}

export interface PermissionsView {
  mode: PermissionMode
  allow: string[]
  ask: string[]
  deny: string[]
}

export const DEFAULT_VIEW: PermissionsView = { mode: 'default', allow: [], ask: [], deny: [] }

export function settingsLocalPath(projectPath: string): string {
  return `${projectPath.replace(/\/+$/, '')}/.claude/settings.local.json`
}

export function parseSettings(raw: string): ClaudeSettings {
  if (!raw.trim()) return {}
  return JSON.parse(raw) as ClaudeSettings
}

export function toView(settings: ClaudeSettings): PermissionsView {
  const p = settings.permissions ?? {}
  return {
    mode: p.defaultMode ?? 'default',
    allow: [...(p.allow ?? [])],
    ask: [...(p.ask ?? [])],
    deny: [...(p.deny ?? [])]
  }
}

export function isCustomized(view: PermissionsView): boolean {
  return view.mode !== 'default' || view.allow.length > 0 || view.ask.length > 0 || view.deny.length > 0
}

export function applyMode(settings: ClaudeSettings, mode: PermissionMode): ClaudeSettings {
  const next: ClaudeSettings = { ...settings }
  const permissions: ClaudePermissionsBlock = { ...(next.permissions ?? {}) }
  const wasDefault = !permissions.defaultMode

  if (mode === 'default') {
    delete permissions.defaultMode
    const stashed = next._vbcdrStashedRules
    if (stashed) {
      if (stashed.allow?.length) permissions.allow = [...stashed.allow]
      if (stashed.ask?.length) permissions.ask = [...stashed.ask]
      if (stashed.deny?.length) permissions.deny = [...stashed.deny]
      delete next._vbcdrStashedRules
    }
  } else {
    if (wasDefault) {
      const stash: StashedRules = {}
      if (permissions.allow?.length) stash.allow = [...permissions.allow]
      if (permissions.ask?.length) stash.ask = [...permissions.ask]
      if (permissions.deny?.length) stash.deny = [...permissions.deny]
      if (stash.allow || stash.ask || stash.deny) next._vbcdrStashedRules = stash
    }
    delete permissions.allow
    delete permissions.ask
    delete permissions.deny
    permissions.defaultMode = mode
  }
  next.permissions = permissions
  return prunePermissions(next)
}

export function addRule(settings: ClaudeSettings, bucket: RuleBucket, rule: string): ClaudeSettings {
  const trimmed = rule.trim()
  if (!trimmed) return settings
  const permissions: ClaudePermissionsBlock = { ...(settings.permissions ?? {}) }
  const list = [...(permissions[bucket] ?? [])]
  if (list.includes(trimmed)) return settings
  list.push(trimmed)
  permissions[bucket] = list
  return { ...settings, permissions }
}

export function removeRule(settings: ClaudeSettings, bucket: RuleBucket, rule: string): ClaudeSettings {
  const permissions: ClaudePermissionsBlock = { ...(settings.permissions ?? {}) }
  const list = (permissions[bucket] ?? []).filter((r) => r !== rule)
  if (list.length === 0) delete permissions[bucket]
  else permissions[bucket] = list
  return prunePermissions({ ...settings, permissions })
}

export interface PresetLike {
  mode: PermissionMode
  allow: string[]
  ask: string[]
  deny: string[]
}

export function applyPreset(settings: ClaudeSettings, preset: PresetLike): ClaudeSettings {
  const next: ClaudeSettings = { ...settings }
  delete next._vbcdrStashedRules
  const permissions: ClaudePermissionsBlock = { ...(next.permissions ?? {}) }
  if (preset.mode === 'default') delete permissions.defaultMode
  else permissions.defaultMode = preset.mode

  if (preset.allow.length) permissions.allow = [...preset.allow]
  else delete permissions.allow

  if (preset.ask.length) permissions.ask = [...preset.ask]
  else delete permissions.ask

  if (preset.deny.length) permissions.deny = [...preset.deny]
  else delete permissions.deny

  next.permissions = permissions
  return prunePermissions(next)
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  for (const x of b) if (!setA.has(x)) return false
  return true
}

export function matchesPreset(view: PermissionsView, preset: PresetLike): boolean {
  return (
    view.mode === preset.mode &&
    sameSet(view.allow, preset.allow) &&
    sameSet(view.ask, preset.ask) &&
    sameSet(view.deny, preset.deny)
  )
}

function prunePermissions(settings: ClaudeSettings): ClaudeSettings {
  const p = settings.permissions
  if (!p) return settings
  const empty =
    !p.allow?.length &&
    !p.ask?.length &&
    !p.deny?.length &&
    !p.defaultMode &&
    !p.additionalDirectories?.length &&
    !p.disableBypassPermissionsMode &&
    !p.disableAutoMode
  if (empty) {
    const next = { ...settings }
    delete next.permissions
    return next
  }
  return settings
}

export function serialize(settings: ClaudeSettings): string {
  return JSON.stringify(settings, null, 2) + '\n'
}

export async function readSettings(projectPath: string): Promise<ClaudeSettings> {
  const file = settingsLocalPath(projectPath)
  try {
    const raw: string = await window.api.claude.readFile(file, projectPath)
    return parseSettings(raw)
  } catch {
    return {}
  }
}

export async function writeSettings(projectPath: string, settings: ClaudeSettings): Promise<void> {
  const file = settingsLocalPath(projectPath)
  await window.api.claude.writeFile(file, serialize(settings), projectPath)
}
